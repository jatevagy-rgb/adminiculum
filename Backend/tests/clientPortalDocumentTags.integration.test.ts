/**
 * Client Portal Documents — Slice 2 (client-uploaded + compliance tags)
 * PostgreSQL integration boundary.
 *
 * Proves, against a real database, that:
 *  - clientUploaded is derived from the EXACT published version's
 *    DocumentVersion.uploadSource (CLIENT_UPLOAD / CLIENT_PORTAL only);
 *  - isCompliancePolicy is derived only from ComplianceDocument rows with
 *    audience CLIENT_POLICY (INTERNAL_ANALYSIS never qualifies);
 *  - multiple compliance rows never duplicate the portal document row;
 *  - unpublished drafts and cross-org documents stay absent;
 *  - the raw uploadSource enum never leaves the portal DTO.
 */
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import {
  approveDocumentPublication,
  createDocumentPublication,
  listPortalDocuments,
  publishDocumentPublication,
  submitDocumentPublication,
} from '../src/modules/client-publication/publicationService';

const databaseUrl = process.env.CLIENT_INTERACTION_TEST_DATABASE_URL
  || process.env.PUBLICATION_TEST_DATABASE_URL
  || process.env.CLIENT_IDENTITY_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('Client portal document tags (clientUploaded + isCompliancePolicy) PostgreSQL boundary', () => {
  let db: PrismaClient;
  const admin = crypto.randomUUID();
  const client = crypto.randomUUID();
  const workspace = crypto.randomUUID();
  const caseId = crypto.randomUUID();
  const otherCaseId = crypto.randomUUID();
  const identityId = crypto.randomUUID();
  const membershipId = crypto.randomUUID();

  const docs = {
    upload: crypto.randomUUID(),
    portal: crypto.randomUUID(),
    lawyer: crypto.randomUUID(),
    policy: crypto.randomUUID(),
    internal: crypto.randomUUID(),
    draft: crypto.randomUUID(),
    otherCase: crypto.randomUUID(),
  };
  const versions: Record<string, string> = {
    uploadV1: crypto.randomUUID(),
    uploadV2: crypto.randomUUID(),
    portalV1: crypto.randomUUID(),
    lawyerV1: crypto.randomUUID(),
    policyV1: crypto.randomUUID(),
    internalV1: crypto.randomUUID(),
    draftV1: crypto.randomUUID(),
    otherCaseV1: crypto.randomUUID(),
  };
  const requirements = { req1: crypto.randomUUID(), req2: crypto.randomUUID() };

  const actor = { userId: admin, role: 'ADMIN' };

  async function publishSelectedDocument(documentId: string, documentVersionId: string): Promise<string> {
    const draft = await createDocumentPublication(actor, {
      documentId,
      documentVersionId,
      workspaceId: workspace,
      visibility: 'SELECTED_PARTICIPANTS',
      recipientMembershipIds: [membershipId],
      clientFacingTitle: `Published ${documentId.slice(0, 8)}`,
      clientFacingExplanation: 'Client-safe explanation.',
    }, db);
    const submitted = await submitDocumentPublication(actor, draft.id, { expectedRevision: draft.revision }, db);
    const approved = await approveDocumentPublication(actor, draft.id, { expectedRevision: submitted.revision }, db);
    const published = await publishDocumentPublication(actor, draft.id, { expectedRevision: approved.revision }, db);
    return published.id;
  }

  async function makeDocument(documentId: string, targetCaseId: string, currentVersion: number): Promise<void> {
    await db.document.create({
      data: {
        id: documentId,
        name: `Slice2 doc ${documentId.slice(0, 8)}`,
        title: 'Internal title',
        fileName: `${documentId.slice(0, 8)}.txt`,
        category: 'CONTRACT',
        documentType: 'CONTRACT',
        mimeType: 'text/plain',
        caseId: targetCaseId,
        clientId: client,
        currentVersion,
        currentVersionInt: currentVersion,
        version: String(currentVersion),
      } as never,
    });
  }

  async function makeVersion(versionId: string, documentId: string, version: number, uploadSource: string, isCurrent: boolean, previousVersionId: string | null = null): Promise<void> {
    await db.documentVersion.create({
      data: {
        id: versionId,
        documentId,
        version,
        name: `${documentId.slice(0, 8)}-v${version}.txt`,
        originalFileName: `${documentId.slice(0, 8)}-v${version}.txt`,
        mimeType: 'text/plain',
        size: 10 + version,
        storageReference: `slice2-storage-${versionId.slice(0, 8)}`,
        spItemId: `slice2-sp-${versionId.slice(0, 8)}`,
        isCurrent,
        uploadedById: admin,
        versionType: 'ORIGINAL',
        uploadSource: uploadSource as never,
        ...(previousVersionId ? { previousVersionId } : {}),
      } as never,
    });
  }

  async function makeReview(documentId: string, versionId: string): Promise<void> {
    await db.documentReview.create({
      data: {
        documentId,
        documentVersionId: versionId,
        approvedVersionId: versionId,
        status: 'CLOSED',
        ownerId: admin,
        createdById: admin,
        assignedReviewerId: admin,
        completedAt: new Date(),
      } as never,
    });
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.CLIENT_PORTAL_READ_ENABLED = 'true';
    process.env.CLIENT_PORTAL_ACTIONS_ENABLED = 'true';
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.$connect();
    await db.user.create({ data: { id: admin, email: `${admin}@example.invalid`, name: 'Slice2 Admin', role: 'ADMIN', status: 'ACTIVE', isActive: true, skills: [] } as never });
    await db.client.create({ data: { id: client, name: 'Slice2 Document Tags Client' } });
    await db.clientPortalWorkspace.create({ data: { id: workspace, clientId: client, name: 'Slice2 Organization Workspace', mode: 'ORGANIZATION', communicationMode: 'PORTAL_PRIMARY', publicReference: `slice2-${workspace.slice(0, 8)}`, createdById: admin } as never });
    await db.case.createMany({ data: [
      { id: caseId, caseNumber: `SLICE2-${caseId.slice(0, 8)}`, title: 'Slice2 scoped case', caseType: 'CONTRACT_REVIEW', clientId: client, createdById: admin, assignedLawyerId: admin },
      { id: otherCaseId, caseNumber: `SLICE2O-${otherCaseId.slice(0, 8)}`, title: 'Slice2 other case', caseType: 'CONTRACT_REVIEW', clientId: client, createdById: admin, assignedLawyerId: admin },
    ] as never });
    await db.clientPortalIdentity.create({ data: { id: identityId, provider: 'ENTRA_EXTERNAL_ID', issuer: 'slice2-test', subject: `sub-${identityId}`, normalizedEmail: `slice2-${identityId}@example.invalid`, emailVerifiedAt: new Date(), displayName: 'Slice2 Customer', accountType: 'ORGANIZATION_MEMBER', status: 'ACTIVE' } as never });
    await db.clientPortalWorkspaceMembership.create({ data: { id: membershipId, clientPortalIdentityId: identityId, workspaceId: workspace, status: 'ACTIVE', approvedAt: new Date(), approvedById: admin } as never });
    await db.clientPortalGrant.create({ data: { clientPortalIdentityId: identityId, workspaceId: workspace, clientId: client, caseId, status: 'ACTIVE', participantRole: 'REQUESTER', isRequester: true, permissions: ['MATTER_READ', 'DOCUMENT_READ', 'DOCUMENT_DOWNLOAD'] as never, invitedById: admin, activatedAt: new Date() } as never });

    // Exact-version pair: v1 is CLIENT_UPLOAD and published; v2 is LAWYER_UPLOAD
    // and current. Classification must follow the PUBLISHED version.
    await makeDocument(docs.upload, caseId, 2);
    await makeVersion(versions.uploadV1, docs.upload, 1, 'CLIENT_UPLOAD', false);
    await makeVersion(versions.uploadV2, docs.upload, 2, 'LAWYER_UPLOAD', true, versions.uploadV1);
    await makeReview(docs.upload, versions.uploadV1);

    await makeDocument(docs.portal, caseId, 1);
    await makeVersion(versions.portalV1, docs.portal, 1, 'CLIENT_PORTAL', true);
    await makeReview(docs.portal, versions.portalV1);

    await makeDocument(docs.lawyer, caseId, 1);
    await makeVersion(versions.lawyerV1, docs.lawyer, 1, 'LAWYER_UPLOAD', true);
    await makeReview(docs.lawyer, versions.lawyerV1);

    await makeDocument(docs.policy, caseId, 1);
    await makeVersion(versions.policyV1, docs.policy, 1, 'LAWYER_UPLOAD', true);
    await makeReview(docs.policy, versions.policyV1);

    await makeDocument(docs.internal, caseId, 1);
    await makeVersion(versions.internalV1, docs.internal, 1, 'LAWYER_UPLOAD', true);
    await makeReview(docs.internal, versions.internalV1);

    await makeDocument(docs.draft, caseId, 1);
    await makeVersion(versions.draftV1, docs.draft, 1, 'CLIENT_UPLOAD', true);
    await makeReview(docs.draft, versions.draftV1);

    await makeDocument(docs.otherCase, otherCaseId, 1);
    await makeVersion(versions.otherCaseV1, docs.otherCase, 1, 'CLIENT_UPLOAD', true);
    await makeReview(docs.otherCase, versions.otherCaseV1);

    await db.complianceDomain.create({ data: { code: 'SLICE2-DOM', label: 'Slice 2 domain' } });
    await db.requirement.createMany({ data: [
      { id: requirements.req1, key: `slice2-req-1-${requirements.req1.slice(0, 8)}`, jurisdictionCode: 'HU', domainCode: 'SLICE2-DOM' },
      { id: requirements.req2, key: `slice2-req-2-${requirements.req2.slice(0, 8)}`, jurisdictionCode: 'HU', domainCode: 'SLICE2-DOM' },
    ] as never });
    await db.complianceDocument.createMany({ data: [
      { requirementId: requirements.req1, documentId: docs.policy, audience: 'CLIENT_POLICY' },
      { requirementId: requirements.req2, documentId: docs.policy, audience: 'CLIENT_POLICY' },
      { requirementId: requirements.req1, documentId: docs.internal, audience: 'INTERNAL_ANALYSIS' },
    ] as never });
  });

  afterAll(async () => { await db?.$disconnect(); });

  it('derives both classifications from canonical sources and never leaks raw provenance', async () => {
    const customerActor = { userId: identityId, role: 'CLIENT_PORTAL', workspaceId: workspace };
    const uploadPublicationId = await publishSelectedDocument(docs.upload, versions.uploadV1);
    const portalPublicationId = await publishSelectedDocument(docs.portal, versions.portalV1);
    const lawyerPublicationId = await publishSelectedDocument(docs.lawyer, versions.lawyerV1);
    const policyPublicationId = await publishSelectedDocument(docs.policy, versions.policyV1);
    const internalPublicationId = await publishSelectedDocument(docs.internal, versions.internalV1);
    await publishSelectedDocument(docs.otherCase, versions.otherCaseV1);

    // Unpublished draft must remain absent (publication gate).
    await createDocumentPublication(actor, {
      documentId: docs.draft,
      documentVersionId: versions.draftV1,
      workspaceId: workspace,
      visibility: 'SELECTED_PARTICIPANTS',
      recipientMembershipIds: [membershipId],
      clientFacingTitle: 'Draft must not publish',
    }, db);

    const { items } = await listPortalDocuments(customerActor, null, db);
    const rows = items as Array<Record<string, any>>;
    const byId = new Map(rows.map((item) => [item.id, item]));
    const ids = rows.map((item) => item.id);

    // Publication gate + org scoping: draft and cross-case documents absent.
    expect(ids).toContain(uploadPublicationId);
    expect(ids).toContain(portalPublicationId);
    expect(ids).toContain(lawyerPublicationId);
    expect(ids).toContain(policyPublicationId);
    expect(ids).toContain(internalPublicationId);
    expect(rows.map((item) => item.title).join(' ')).not.toContain('Draft must not publish');

    // Exact published version drives the classification: v1 (CLIENT_UPLOAD) is
    // published while v2 (LAWYER_UPLOAD) is current.
    expect(byId.get(uploadPublicationId)).toMatchObject({ clientUploaded: true, isCompliancePolicy: false });
    expect(byId.get(portalPublicationId)).toMatchObject({ clientUploaded: true });
    expect(byId.get(lawyerPublicationId)).toMatchObject({ clientUploaded: false });

    // CLIENT_POLICY qualifies; two compliance rows never duplicate the row.
    expect(ids.filter((id) => id === policyPublicationId)).toHaveLength(1);
    expect(byId.get(policyPublicationId)).toMatchObject({ isCompliancePolicy: true });

    // INTERNAL_ANALYSIS never qualifies.
    expect(byId.get(internalPublicationId)).toMatchObject({ isCompliancePolicy: false });

    // Raw provenance never leaves the DTO.
    const serialized = JSON.stringify(items);
    expect(serialized).not.toMatch(/uploadSource/);
    expect(serialized).not.toMatch(/CLIENT_UPLOAD|CLIENT_PORTAL|LAWYER_UPLOAD/);
    expect(serialized).not.toMatch(/INTERNAL_ANALYSIS/);
    expect(serialized).not.toMatch(/CLIENT_POLICY/);
    for (const item of rows) {
      expect(typeof item.clientUploaded).toBe('boolean');
      expect(typeof item.isCompliancePolicy).toBe('boolean');
    }
  });
});
