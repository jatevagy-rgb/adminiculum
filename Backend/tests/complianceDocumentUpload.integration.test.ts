/**
 * Compliance document upload — PostgreSQL orchestration suite (C4 upload UX).
 *
 * Executes the REAL database behaviour of the canonical upload orchestration:
 * compliance Case reuse/creation, canonical terminal-status exclusion, Case
 * authorization for lawyers, ambiguity bounds, INTERNAL_ANALYSIS vs CLIENT_POLICY
 * linkage + publication truthfulness, fail-fast invalid requirement, and a true
 * concurrent zero-case resolution.
 *
 * SharePoint storage and the SEC-2 upload gate are spied here because they are
 * covered by their own suites; everything else (case, document, version, linkage,
 * publication rows) is real.
 *
 * Skipped without a test database, matching the repository convention.
 */
import { describe, it, beforeAll, afterAll, beforeEach, expect, jest } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { prisma as db } from '../src/prisma/prisma.service';
import { driveService } from '../src/modules/sharepoint';
import * as uploadValidation from '../src/modules/upload-security/uploadValidationCore';
import { provisionComplianceModuleRules } from '../src/modules/compliance/complianceModuleProvisioning';
import { createGrant, transitionGrant } from '../src/modules/client-publication/publicationService';
import { uploadComplianceDocument } from '../src/modules/compliance/complianceUploadService';

const dbUrl = process.env.CLIENT_INTERACTION_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = dbUrl ? describe : describe.skip;

describeWithDatabase('Compliance document upload (PostgreSQL)', () => {
  const suffix = `${Date.now()}`;
  const adminId = `c4up-admin-${suffix}`;
  const lawyerId = `c4up-lawyer-${suffix}`;
  const clientUserId = `c4up-client-user-${suffix}`;
  const clientId = `c4up-client-${suffix}`;
  const clientBId = `c4up-client-b-${suffix}`;
  const adminActor = { userId: adminId, role: 'ADMIN' };
  const lawyerActor = { userId: lawyerId, role: 'LAWYER' };
  let requirementKey = '';

  const documentCountForClient = () =>
    db.document.count({ where: { case: { clientId } } });

  const casesForClient = () =>
    db.case.findMany({
      where: { clientId, status: { notIn: ['FINAL', 'CANCELLED', 'ARCHIVED'] } },
      select: { id: true, matterType: true, caseTypeDefinitionId: true, status: true, createdById: true },
      orderBy: { createdAt: 'asc' },
    });

  const upload = (intent: 'INTERNAL_ANALYSIS' | 'CLIENT_POLICY', targetClient = clientId, actor = adminActor, key = requirementKey) =>
    uploadComplianceDocument(
      actor as never,
      {
        clientId: targetClient,
        requirementKey: key,
        intent,
        fileName: `master-${intent}-${randomUUID()}.docx`,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        fileContent: Buffer.from('collected-fixture-bytes'),
      } as never,
      db as never,
    );

  beforeAll(async () => {
    jest.spyOn(uploadValidation, 'validateWorkforceUpload').mockResolvedValue({
      ok: true,
      detectedMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      sizeBytes: 22,
      codeSafe: 'OK',
    } as never);
    // Canonical DocumentOperationResult contract: createDocument() requires
    // `success` AND `item` (it reads item.id / item.name) plus webUrl/version.
    jest.spyOn(driveService, 'uploadDocument').mockImplementation(async (options: { fileName?: string } | unknown) => ({
      success: true,
      item: {
        id: `sp-item-${randomUUID()}`,
        name: String((options as { fileName?: string } | null)?.fileName || 'stored.docx'),
      },
      webUrl: 'https://sharepoint.invalid/doc',
      version: '1',
    } as never));

    await db.user.create({ data: { id: adminId, email: `c4up-admin-${suffix}@fixture.invalid`, name: 'C4 Upload Admin', role: 'ADMIN', status: 'ACTIVE', isActive: true, skills: [] } as never });
    await db.user.create({ data: { id: lawyerId, email: `c4up-lawyer-${suffix}@fixture.invalid`, name: 'C4 Upload Lawyer', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] } as never });
    // Canonical publication audience requires a real CLIENT-role user; an internal
    // ADMIN is rejected by createGrant with CLIENT_USER_REQUIRED.
    await db.user.create({ data: { id: clientUserId, email: `c4up-client-${suffix}@fixture.invalid`, name: 'C4 Upload Client User', role: 'CLIENT', status: 'ACTIVE', isActive: true, skills: [] } as never });
    await db.client.create({ data: { id: clientId, name: 'C4 Upload Client' } });
    await db.client.create({ data: { id: clientBId, name: 'C4 Upload Client B' } });
    await provisionComplianceModuleRules(db, adminId);

    const requirement = await db.requirement.findFirst({ select: { key: true } });
    expectationGuard(requirement);
    requirementKey = requirement!.key;
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    const caseIds = (await db.case.findMany({ where: { clientId: { in: [clientId, clientBId] } }, select: { id: true } })).map((row) => row.id);
    const versionIds = (await db.documentVersion.findMany({ where: { document: { caseId: { in: caseIds } } }, select: { id: true } })).map((row) => row.id);
    // Canonical child-before-parent order, as used by the existing Case/Work Package
    // integration suites: tasks -> matter publications -> work package -> timeline -> case.
    await db.task.deleteMany({ where: { caseId: { in: caseIds } } });
    await db.clientMatterPublication.deleteMany({ where: { caseId: { in: caseIds } } });
    await db.caseWorkPackageItem.deleteMany({ where: { caseWorkPackage: { caseId: { in: caseIds } } } });
    await db.caseWorkPackage.deleteMany({ where: { caseId: { in: caseIds } } });
    await db.timelineEvent.deleteMany({ where: { caseId: { in: caseIds } } });
    await db.complianceDocumentClauseAnchor.deleteMany({ where: { documentVersionId: { in: versionIds } } });
    await db.clientDocumentPublication.deleteMany({ where: { clientId: { in: [clientId, clientBId] } } });
    await db.clientPortalGrant.deleteMany({ where: { clientId: { in: [clientId, clientBId] } } });
    await db.complianceDocument.deleteMany({ where: { document: { caseId: { in: caseIds } } } });
    await db.documentVersion.deleteMany({ where: { document: { caseId: { in: caseIds } } } });
    await db.document.deleteMany({ where: { caseId: { in: caseIds } } });
    await db.case.deleteMany({ where: { id: { in: caseIds } } });
    await db.client.deleteMany({ where: { id: { in: [clientId, clientBId] } } });
    await db.user.deleteMany({ where: { id: { in: [adminId, lawyerId, clientUserId] } } });
  });

  it('B. creates a canonical compliance Case on the first upload', async () => {
    const result = await upload('INTERNAL_ANALYSIS');
    expect(result.caseCreated).toBe(true);
    const created = await db.case.findUniqueOrThrow({ where: { id: result.caseId } });
    expect(created.clientId).toBe(clientId);
    expect(created.status).not.toBe('FINAL');
  });

  it('A. reuses the eligible compliance Case on the next upload', async () => {
    const first = await casesForClient();
    const result = await upload('INTERNAL_ANALYSIS');
    expect(result.caseReused).toBe(true);
    expect(result.caseId).toBe(first[0].id);
    expect(await casesForClient()).toHaveLength(first.length);
  });

  it('C. never reuses a CANCELLED or ARCHIVED compliance Case', async () => {
    const [current] = await casesForClient();
    await db.case.update({ where: { id: current.id }, data: { status: 'CANCELLED' } });
    const afterCancelled = await upload('INTERNAL_ANALYSIS');
    expect(afterCancelled.caseId).not.toBe(current.id);

    await db.case.update({ where: { id: afterCancelled.caseId }, data: { status: 'ARCHIVED' } });
    const afterArchived = await upload('INTERNAL_ANALYSIS');
    expect(afterArchived.caseId).not.toBe(afterCancelled.caseId);
  });

  it('D. denies a lawyer who cannot access the eligible compliance Case and creates no duplicate', async () => {
    const before = await documentCountForClient();
    const [eligible] = await casesForClient();
    // The lawyer has client read access through a DIFFERENT case in the same client.
    const otherMatter = eligible.matterType === 'LITIGATION' ? 'CORPORATE' : 'LITIGATION';
    await db.case.create({
      data: {
        id: `c4up-lawyer-case-${suffix}`,
        caseNumber: `C4UP-L-${suffix}`,
        title: 'Lawyer access case',
        clientName: 'C4 Upload Client',
        matterType: otherMatter as never,
        caseType: 'OTHER' as never,
        status: 'DRAFT' as never,
        clientId,
        assignedLawyerId: lawyerId,
        createdById: adminId,
      } as never,
    });

    await expect(upload('INTERNAL_ANALYSIS', clientId, lawyerActor)).rejects.toMatchObject({
      code: 'CASE_ACCESS_FORBIDDEN',
    });
    expect(await documentCountForClient()).toBe(before);
    expect((await casesForClient()).some((row) => row.createdById === lawyerId)).toBe(false);
  });

  it('E. refuses to guess when more than one compliance Case is eligible', async () => {
    const before = await documentCountForClient();
    const [eligible] = await casesForClient();
    await db.case.create({
      data: {
        id: `c4up-ambiguous-${suffix}`,
        caseNumber: `C4UP-A-${suffix}`,
        title: 'Ambiguous compliance case',
        clientName: 'C4 Upload Client',
        matterType: eligible.matterType as never,
        caseType: 'OTHER' as never,
        caseTypeDefinitionId: eligible.caseTypeDefinitionId,
        status: 'DRAFT' as never,
        clientId,
        createdById: adminId,
      } as never,
    });

    await expect(upload('INTERNAL_ANALYSIS')).rejects.toMatchObject({ code: 'COMPLIANCE_CASE_AMBIGUOUS' });
    expect(await documentCountForClient()).toBe(before);

    await db.case.deleteMany({ where: { id: `c4up-ambiguous-${suffix}` } });
  });

  it('I. rejects an invalid requirement key with zero document side effect', async () => {
    const before = await documentCountForClient();
    await expect(upload('INTERNAL_ANALYSIS', clientId, adminActor, `c4up-missing-${suffix}`)).rejects.toMatchObject({
      code: 'COMPLIANCE_UPLOAD_REQUIREMENT_NOT_FOUND',
    });
    expect(await documentCountForClient()).toBe(before);
  });

  it('F. INTERNAL_ANALYSIS upload links internally and never creates a client publication', async () => {
    const result = await upload('INTERNAL_ANALYSIS');
    const document = await db.document.findUniqueOrThrow({ where: { id: result.documentId } });
    expect(document.caseId).toBe(result.caseId);
    const version = await db.documentVersion.findFirst({ where: { documentId: result.documentId }, orderBy: { version: 'desc' } });
    expect(version).not.toBeNull();
    const linkage = await db.complianceDocument.findFirst({ where: { documentId: result.documentId } });
    expect(linkage?.audience).toBe('INTERNAL_ANALYSIS');
    expect(result.publication).toBeNull();
    const publications = await db.clientDocumentPublication.findMany({ where: { documentId: result.documentId } });
    expect(publications).toHaveLength(0);
  });

  it('H. CLIENT_POLICY persists document + linkage and truthfully reports NOT_CREATED without an active audience', async () => {
    const result = await upload('CLIENT_POLICY', clientBId);
    expect(result.publication?.status).toBe('NOT_CREATED');
    expect(result.publication?.publicationId).toBeNull();
    const linkage = await db.complianceDocument.findFirst({ where: { documentId: result.documentId } });
    expect(linkage?.audience).toBe('CLIENT_POLICY');
    const published = await db.clientDocumentPublication.findMany({
      where: { documentId: result.documentId, status: 'PUBLISHED', revokedAt: null },
    });
    expect(published).toHaveLength(0);
  });

  it('G. CLIENT_POLICY enters the canonical DRAFT publication lifecycle when the audience exists', async () => {
    const seed = await upload('INTERNAL_ANALYSIS');
    const caseId = seed.caseId;
    const grant = await createGrant(adminActor as never, { clientId, caseId, clientUserId, role: 'VIEWER', permissions: [] } as never, db as never);
    await transitionGrant(adminActor as never, String(grant.id), 'activate', {} as never, db as never);

    const result = await upload('CLIENT_POLICY');
    expect(result.publication?.status).toBe('DRAFT');
    expect(result.publication?.publicationId).not.toBeNull();

    const row = await db.clientDocumentPublication.findUniqueOrThrow({ where: { id: result.publication!.publicationId as string } });
    expect(String(row.status)).toBe('DRAFT');
    expect(row.publishedAt ?? null).toBeNull();
  });

  it('EXPLICIT. reuses a selected eligible case; rejects another-client, terminal and inaccessible selections before upload', async () => {
    const [eligible] = await casesForClient();
    const before = await documentCountForClient();

    // Valid explicit selection → reused, one upload.
    const ok = await uploadComplianceDocument(
      adminActor as never,
      {
        clientId,
        requirementKey,
        intent: 'INTERNAL_ANALYSIS',
        fileName: `explicit-${randomUUID()}.docx`,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        fileContent: Buffer.from('collected-fixture-bytes'),
        caseId: eligible.id,
      } as never,
      db as never,
    );
    expect(ok.caseId).toBe(eligible.id);
    expect(ok.caseCreated).toBe(false);
    expect(await documentCountForClient()).toBe(before + 1);

    // Another client's case → rejected, no document.
    const otherClientCase = await db.case.create({
      data: {
        id: `c4up-other-${suffix}`,
        caseNumber: `C4UP-O-${suffix}`,
        title: 'Other client case',
        clientName: 'C4 Upload Client B',
        matterType: eligible.matterType as never,
        caseType: 'OTHER' as never,
        status: 'DRAFT' as never,
        clientId: clientBId,
        createdById: adminId,
      } as never,
    });
    await expect(
      uploadComplianceDocument(
        adminActor as never,
        { clientId, requirementKey, intent: 'INTERNAL_ANALYSIS', fileName: 'x.docx', mimeType: 'application/octet-stream', fileContent: Buffer.from('x'), caseId: otherClientCase.id } as never,
        db as never,
      ),
    ).rejects.toMatchObject({ code: 'COMPLIANCE_UPLOAD_CASE_CLIENT_MISMATCH' });
    expect(await documentCountForClient()).toBe(before + 1);

    // Terminal explicit case → rejected, no document.
    await db.case.update({ where: { id: eligible.id }, data: { status: 'CANCELLED' } });
    await expect(
      uploadComplianceDocument(
        adminActor as never,
        { clientId, requirementKey, intent: 'INTERNAL_ANALYSIS', fileName: 'y.docx', mimeType: 'application/octet-stream', fileContent: Buffer.from('y'), caseId: eligible.id } as never,
        db as never,
      ),
    ).rejects.toMatchObject({ code: 'COMPLIANCE_UPLOAD_CASE_NOT_REUSABLE' });
    await db.case.update({ where: { id: eligible.id }, data: { status: 'DRAFT' } });

    // Inaccessible explicit case for a lawyer → rejected before upload.
    await expect(
      uploadComplianceDocument(
        lawyerActor as never,
        { clientId, requirementKey, intent: 'INTERNAL_ANALYSIS', fileName: 'z.docx', mimeType: 'application/octet-stream', fileContent: Buffer.from('z'), caseId: eligible.id } as never,
        db as never,
      ),
    ).rejects.toMatchObject({ code: 'CASE_ACCESS_FORBIDDEN' });
    expect(await documentCountForClient()).toBe(before + 1);
  });

  it('J. concurrent zero-case resolution never silently creates two reusable compliance Cases', async () => {
    const concurrentClientId = `c4up-concurrent-${suffix}`;
    await db.client.create({ data: { id: concurrentClientId, name: 'C4 Upload Concurrent' } });
    try {
      const attempts = await Promise.allSettled([
        upload('INTERNAL_ANALYSIS', concurrentClientId),
        upload('INTERNAL_ANALYSIS', concurrentClientId),
      ]);
      const fulfilled = attempts.filter((entry) => entry.status === 'fulfilled') as Array<PromiseFulfilledResult<{ caseId: string }>>;
      const rejected = attempts.filter((entry) => entry.status === 'rejected') as Array<PromiseRejectedResult>;

      const cases = await db.case.findMany({ where: { clientId: concurrentClientId }, select: { id: true } });
      // The core invariant: never two reusable compliance cases from the race.
      expect(cases.length).toBe(1);
      if (fulfilled.length === 2) {
        expect(fulfilled[0].value.caseId).toBe(fulfilled[1].value.caseId);
      } else {
        // The approved bounded conflict is acceptable when serialization cannot converge.
        expect(String(rejected[0].reason?.code || '')).toBe('COMPLIANCE_CASE_RESOLUTION_RETRY_EXHAUSTED');
      }
    } finally {
      // Same canonical child-before-parent order for the concurrent fixture.
      const concurrentCaseIds = (await db.case.findMany({ where: { clientId: concurrentClientId }, select: { id: true } })).map((row) => row.id);
      await db.task.deleteMany({ where: { caseId: { in: concurrentCaseIds } } });
      await db.clientMatterPublication.deleteMany({ where: { caseId: { in: concurrentCaseIds } } });
      await db.caseWorkPackageItem.deleteMany({ where: { caseWorkPackage: { caseId: { in: concurrentCaseIds } } } });
      await db.caseWorkPackage.deleteMany({ where: { caseId: { in: concurrentCaseIds } } });
      await db.timelineEvent.deleteMany({ where: { caseId: { in: concurrentCaseIds } } });
      await db.clientDocumentPublication.deleteMany({ where: { clientId: concurrentClientId } });
      await db.complianceDocument.deleteMany({ where: { document: { caseId: { in: concurrentCaseIds } } } });
      await db.documentVersion.deleteMany({ where: { document: { caseId: { in: concurrentCaseIds } } } });
      await db.document.deleteMany({ where: { caseId: { in: concurrentCaseIds } } });
      await db.case.deleteMany({ where: { clientId: concurrentClientId } });
      await db.client.deleteMany({ where: { id: concurrentClientId } });
    }
  });
});

function expectationGuard(value: unknown): void {
  if (!value) throw new Error('Fixture requirement was not provisioned.');
}
