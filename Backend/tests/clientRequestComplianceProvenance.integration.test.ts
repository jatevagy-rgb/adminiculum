/**
 * C4D — customer request Compliance provenance (PostgreSQL integration).
 *
 * Proves the additive, nullable, single-origin provenance model:
 *   - a request may reference exactly one Compliance context (requirement /
 *     control / finding) and persist it with a safe derived label
 *   - cross-client mismatch and non-applicable requirement fail closed (403)
 *   - ambiguous multi-origin input is rejected (400)
 *   - legacy/non-Compliance requests are unchanged (all provenance NULL)
 *   - the customer projection exposes only the safe context label, never
 *     internal requirement/control/finding ids
 */
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import * as requests from '../src/modules/client-interaction/requestService';
import { createClientControl, createControlDefinition } from '../src/modules/compliance/controlEvidenceService';
import { resolveActiveCustomerGrant } from '../src/modules/client-interaction/base';

const databaseUrl = process.env.CLIENT_INTERACTION_TEST_DATABASE_URL || process.env.CLIENT_IDENTITY_TEST_DATABASE_URL;
const d = databaseUrl ? describe : describe.skip;

d('customer request Compliance provenance (PostgreSQL)', () => {
  let db: PrismaClient;
  const suffix = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const clientId = crypto.randomUUID();
  const otherClientId = crypto.randomUUID();
  const caseId = crypto.randomUUID();
  const identityId = crypto.randomUUID();
  const workspaceId = crypto.randomUUID();
  const membershipId = crypto.randomUUID();
  const grantId = crypto.randomUUID();
  const domainCode = `PROV_${suffix}`;
  const requirementId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const ruleId = crypto.randomUUID();
  const actor = { userId: adminId, role: 'ADMIN' };

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    process.env.CLIENT_PORTAL_ACTIONS_ENABLED = 'true';
    for (const g of ['DOCUMENT_REQUESTS', 'DATA_REQUESTS']) process.env[`CLIENT_PORTAL_${g}_ENABLED`] = 'true';
    await db.user.create({ data: { id: adminId, email: `prov-${suffix}@example.invalid`, name: 'Provenance Admin', role: 'ADMIN', status: 'ACTIVE' } as any });
    await db.client.createMany({ data: [{ id: clientId, name: `Provenance A ${suffix}` }, { id: otherClientId, name: `Provenance B ${suffix}` }] });
    await db.case.create({ data: { id: caseId, caseNumber: `PRV-${suffix}`, title: 'Provenance case', caseType: 'OTHER', clientId, createdById: adminId, assignedLawyerId: adminId } as any });
    await db.clientPortalIdentity.create({ data: { id: identityId, provider: 'ENTRA_EXTERNAL_ID', issuer: 'iss', subject: `sub-${identityId}`, normalizedEmail: `c-${identityId}@t.io`, emailVerifiedAt: new Date(), displayName: 'Customer', accountType: 'INDIVIDUAL', status: 'ACTIVE' } });
    await db.clientPortalWorkspace.create({ data: { id: workspaceId, clientId, name: 'Provenance workspace', mode: 'INDIVIDUAL', publicReference: `prov-${workspaceId}`, createdById: adminId } });
    await db.clientPortalWorkspaceMembership.create({ data: { id: membershipId, clientPortalIdentityId: identityId, workspaceId, status: 'ACTIVE', approvedAt: new Date(), approvedById: adminId } });
    await db.clientPortalGrant.create({ data: { id: grantId, clientPortalIdentityId: identityId, workspaceId, clientId, caseId, status: 'ACTIVE', permissions: ['MATTER_READ', 'DOCUMENT_READ'], invitedById: adminId, activatedAt: new Date() } as any });
    await db.complianceDomain.create({ data: { code: domainCode, label: 'Provenance' } });
    await db.requirement.create({ data: { id: requirementId, key: `PROV_REQ_${suffix}`, jurisdictionCode: 'HU', domainCode } });
    await db.requirementVersion.create({ data: { id: versionId, requirementId, versionKey: 'V1', title: 'Home office szabályzat', normativeStatement: 'Test', effectiveFrom: new Date('2026-01-01'), status: 'APPROVED', sourceSupportState: 'SUFFICIENT' } });
    await db.applicabilityRuleVersion.create({ data: { id: ruleId, requirementVersionId: versionId, ruleVersionKey: 'R1', schemaVersion: 'test', astJson: {}, canonicalDigest: 'a'.repeat(64), status: 'APPROVED' } });
    await db.requirementApplicability.create({ data: { clientId, requirementVersionId: versionId, ruleVersionId: ruleId, ruleDigest: 'a'.repeat(64), outcome: 'APPLIES', scopeType: 'COMPANY', evaluationAt: new Date(), sourceSupportState: 'SUFFICIENT', specialistRequirement: 'NONE', schemaVersion: 'test', snapshotJson: {}, snapshotDigest: 'b'.repeat(64) } });
  });

  afterAll(async () => {
    await db.clientRequest.deleteMany({ where: { clientId } });
    await db.clientSubmission.deleteMany({ where: { clientId } });
    await db.clientPortalGrant.deleteMany({ where: { id: grantId } });
    await db.clientPortalWorkspaceMembership.deleteMany({ where: { id: membershipId } });
    await db.clientPortalWorkspace.deleteMany({ where: { id: workspaceId } });
    await db.clientPortalIdentity.deleteMany({ where: { id: identityId } });
    await db.clientControl.deleteMany({ where: { clientId: { in: [clientId, otherClientId] } });
    await db.controlDefinition.deleteMany({ where: { key: { startsWith: `PROV_CTRL_${suffix}` } } });
    await db.assessmentFinding.deleteMany({ where: { clientId: { in: [clientId, otherClientId] } } });
    await db.requirementApplicability.deleteMany({ where: { clientId } });
    await db.applicabilityRuleVersion.delete({ where: { id: ruleId } });
    await db.requirementVersion.delete({ where: { id: versionId } });
    await db.requirement.delete({ where: { id: requirementId } });
    await db.complianceDomain.delete({ where: { code: domainCode } });
    await db.case.deleteMany({ where: { id: caseId } });
    await db.client.deleteMany({ where: { id: { in: [clientId, otherClientId] } } });
    await db.user.delete({ where: { id: adminId } });
    await db.$disconnect();
  });

  const ctx = () => resolveActiveCustomerGrant(identityId, caseId, workspaceId, db);

  it('persists a requirement-origin request and returns its safe context label', async () => {
    const draft = await requests.createRequestDraft(actor, {
      caseId,
      type: 'DOCUMENT_UPLOAD',
      clientSafeTitle: 'Home office szabályzat bekérése',
      complianceContext: { requirementVersionId: versionId },
    }, db);
    expect(draft.complianceContext).toEqual({ requirementVersionId: versionId, clientControlId: null, findingId: null });
    expect(draft.contextLabel).toBe('Home office szabályzat');
    await requests.publishRequest(actor, draft.id, draft.revision, db);
    const visible = await requests.listCustomerRequests(await ctx(), db);
    const row = visible.items.find((r: any) => r.id === draft.id);
    expect(row).toBeTruthy();
    // Customer-safe: label present, internal ids absent.
    expect(row.contextLabel).toBe('Home office szabályzat');
    expect(JSON.stringify(row)).not.toContain(versionId);
    expect(row).not.toHaveProperty('requirementVersionId');
    expect(row).not.toHaveProperty('clientControlId');
    expect(row).not.toHaveProperty('findingId');
  });

  it('persists a control-origin request and rejects a cross-client control', async () => {
    const definition = await createControlDefinition(actor, { key: `PROV_CTRL_${suffix}`, title: 'Beléptetés felülvizsgálata', type: 'TECHNICAL' }, db);
    const control = await createClientControl(actor, clientId, { controlDefinitionId: definition.id }, db);
    const draft = await requests.createRequestDraft(actor, {
      caseId, type: 'DOCUMENT_UPLOAD', clientSafeTitle: 'Beléptetési lista',
      complianceContext: { clientControlId: control.id },
    }, db);
    expect(draft.complianceContext).toEqual({ requirementVersionId: null, clientControlId: control.id, findingId: null });
    expect(draft.contextLabel).toBe('Beléptetés felülvizsgálata');

    // Same control id against a different client must fail closed.
    const foreignCaseId = crypto.randomUUID();
    await db.case.create({ data: { id: foreignCaseId, caseNumber: `PRVX-${suffix}`, title: 'Foreign case', caseType: 'OTHER', clientId: otherClientId, createdById: adminId } as any });
    await expect(requests.createRequestDraft(actor, {
      caseId: foreignCaseId, type: 'DOCUMENT_UPLOAD', clientSafeTitle: 'x',
      complianceContext: { clientControlId: control.id },
    }, db)).rejects.toMatchObject({ code: 'COMPLIANCE_CONTEXT_FORBIDDEN' });
  });

  it('persists a finding-origin request', async () => {
    const finding = await db.assessmentFinding.create({ data: { clientId, title: 'Hiányzó home office intézkedés', severity: 'HIGH', status: 'OPEN', requirementId, createdByUserId: adminId } as any });
    const draft = await requests.createRequestDraft(actor, {
      caseId, type: 'QUESTION_RESPONSE', clientSafeTitle: 'Intézkedés egyeztetése',
      complianceContext: { findingId: finding.id },
    }, db);
    expect(draft.complianceContext).toEqual({ requirementVersionId: null, clientControlId: null, findingId: finding.id });
    expect(draft.contextLabel).toBe('Hiányzó home office intézkedés');
  });

  it('rejects a requirement version not applicable to the client', async () => {
    const foreignVersion = await db.requirementVersion.create({ data: { requirementId, versionKey: 'V2-FOREIGN', title: 'Foreign requirement', normativeStatement: 'Test', effectiveFrom: new Date('2026-01-01'), status: 'APPROVED', sourceSupportState: 'SUFFICIENT' } });
    await expect(requests.createRequestDraft(actor, {
      caseId, type: 'INFORMATION_REQUEST', clientSafeTitle: 'x',
      complianceContext: { requirementVersionId: foreignVersion.id },
    }, db)).rejects.toMatchObject({ code: 'COMPLIANCE_CONTEXT_FORBIDDEN' });
  });

  it('rejects an ambiguous multi-origin context and keeps legacy requests unchanged', async () => {
    await expect(requests.createRequestDraft(actor, {
      caseId, type: 'INFORMATION_REQUEST', clientSafeTitle: 'x',
      complianceContext: { requirementVersionId: versionId, findingId: crypto.randomUUID() },
    }, db)).rejects.toMatchObject({ code: 'COMPLIANCE_CONTEXT_AMBIGUOUS' });

    const legacy = await requests.createRequestDraft(actor, { caseId, type: 'INFORMATION_REQUEST', clientSafeTitle: 'Legacy' }, db);
    expect(legacy.complianceContext).toBeNull();
    expect(legacy.contextLabel).toBeNull();
  });
});
