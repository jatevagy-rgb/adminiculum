import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createClientControl, createControlDefinition, createEvidenceRecord, getControlCoverage, linkEvidenceToControl, mapControlToRequirement, updateClientControl } from '../src/modules/compliance/controlEvidenceService';

const databaseUrl = process.env.PHASE7CB_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('compliance controls and evidence (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const clientId = crypto.randomUUID();
  const secondClientId = crypto.randomUUID();
  const domainCode = `CTRL_${suffix}`;
  const requirementId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const ruleId = crypto.randomUUID();
  const actor = { userId: adminId, role: 'ADMIN' };

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.user.create({ data: { id: adminId, email: `controls-${suffix}@example.invalid`, name: 'Controls Admin', role: 'ADMIN' } });
    await db.client.createMany({ data: [{ id: clientId, name: `Controls A ${suffix}` }, { id: secondClientId, name: `Controls B ${suffix}` }] });
    await db.complianceDomain.create({ data: { code: domainCode, label: 'Controls' } });
    await db.requirement.create({ data: { id: requirementId, key: `CTRL_REQ_${suffix}`, jurisdictionCode: 'HU', domainCode } });
    await db.requirementVersion.create({ data: { id: versionId, requirementId, versionKey: 'V1', title: 'Control requirement', normativeStatement: 'Test', effectiveFrom: new Date('2026-01-01'), status: 'APPROVED', sourceSupportState: 'SUFFICIENT' } });
    await db.applicabilityRuleVersion.create({ data: { id: ruleId, requirementVersionId: versionId, ruleVersionKey: 'R1', schemaVersion: 'test', astJson: {}, canonicalDigest: 'a'.repeat(64), status: 'APPROVED' } });
    await db.requirementApplicability.create({ data: { clientId, requirementVersionId: versionId, ruleVersionId: ruleId, ruleDigest: 'a'.repeat(64), outcome: 'APPLIES', scopeType: 'COMPANY', evaluationAt: new Date(), sourceSupportState: 'SUFFICIENT', specialistRequirement: 'NONE', schemaVersion: 'test', snapshotJson: {}, snapshotDigest: 'b'.repeat(64) } });
  });

  afterAll(async () => {
    await db.evidenceControlLink.deleteMany({ where: { clientId } });
    await db.evidenceRecord.deleteMany({ where: { clientId: { in: [clientId, secondClientId] } } });
    await db.clientControl.deleteMany({ where: { clientId: { in: [clientId, secondClientId] } } });
    await db.requirementControlMap.deleteMany({ where: { requirementVersionId: versionId } });
    await db.requirementApplicability.deleteMany({ where: { clientId } });
    await db.applicabilityRuleVersion.delete({ where: { id: ruleId } });
    await db.requirementVersion.delete({ where: { id: versionId } });
    await db.requirement.delete({ where: { id: requirementId } });
    await db.complianceDomain.delete({ where: { code: domainCode } });
    await db.client.deleteMany({ where: { id: { in: [clientId, secondClientId] } } });
    await db.user.delete({ where: { id: adminId } });
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
    await expect(createClientControl(actor, clientId, { controlDefinitionId: definition.id }, db)).rejects.toBeTruthy();
    await updateClientControl(actor, clientId, control.id, { implementationStatus: 'PARTIAL' }, db);
    expect((await db.clientControl.findUniqueOrThrow({ where: { id: control.id } })).implementationStatus).toBe('PARTIAL');
    expect(await db.clientControl.count({ where: { clientId } })).toBe(1);
  });

  it('EXTERNAL_REFERENCE_EVIDENCE, ONE_EVIDENCE_MULTIPLE_CONTROLS, MULTIPLE_EVIDENCE_ONE_CONTROL, CROSS_CLIENT_EVIDENCE_CONTROL_LINK_DENIED, EVIDENCE_FRESHNESS_STALE, STALE_EVIDENCE_NOT_DELETED, ZERO_AUTO_IMPLEMENTED_STATUS', async () => {
    const definition = await db.controlDefinition.findFirstOrThrow({ where: { key: `access_review_${suffix}` } });
    const first = await db.clientControl.findFirstOrThrow({ where: { clientId } });
    const second = await db.clientControl.create({ data: { clientId, controlDefinitionId: (await db.controlDefinition.create({ data: { key: `incident_${suffix}`, title: 'Incident procedure', type: 'PROCEDURAL' } })).id } });
    const stale = await createEvidenceRecord(actor, clientId, { sourceType: 'EXTERNAL_REFERENCE', title: 'Old review', externalReference: 'https://example.invalid/review', status: 'ACCEPTED', validUntil: new Date('2020-01-01') }, db);
    const current = await createEvidenceRecord(actor, clientId, { sourceType: 'EXTERNAL_REFERENCE', title: 'Current review', externalReference: 'https://example.invalid/current', status: 'ACCEPTED' }, db);
    await linkEvidenceToControl(actor, clientId, first.id, stale.id, db);
    await linkEvidenceToControl(actor, clientId, second.id, stale.id, db);
    await linkEvidenceToControl(actor, clientId, first.id, current.id, db);
    await expect(linkEvidenceToControl(actor, secondClientId, first.id, current.id, db)).rejects.toBeTruthy();
    expect((await getControlCoverage(actor, clientId, db)).requirements[0].controls[0].evidenceSummary.stale).toBe(1);
    expect((await db.evidenceRecord.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe('ACCEPTED');
    expect((await db.clientControl.findUniqueOrThrow({ where: { id: first.id } })).implementationStatus).toBe('NOT_ASSESSED');
    void definition;
  });
});
