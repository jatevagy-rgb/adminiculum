/**
 * CDI-1 — persistence, provenance, idempotency, triggers and client isolation.
 *
 * Requires PostgreSQL (same gate as the other compliance integration suites).
 * Without CLIENT_INTERACTION_TEST_DATABASE_URL / MIGRATION_REPLAY_DATABASE_URL
 * the suite is skipped, matching the repository convention.
 *
 * Content is supplied through the SharePoint content loader (spied in this
 * suite), so no real legal document and no external storage is involved.
 */
import { describe, it, beforeAll, afterAll, expect, jest } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { prisma as db } from '../src/prisma/prisma.service';
import { driveService } from '../src/modules/sharepoint';
import { provisionComplianceModuleRules } from '../src/modules/compliance/complianceModuleProvisioning';
import { linkComplianceDocument } from '../src/modules/compliance/complianceDocumentService';
import { getClientSafeComplianceReadModel } from '../src/modules/compliance/clientSafeComplianceService';
import { answerCompanyProfileQuestion } from '../src/modules/client-workspace/companyProfileAnswerService';
import {
  findClauseAnchorsByAnchorKey,
  ingestClauseAnchorsForVersion,
  ingestCurrentVersionForInternalAnalysisDocument,
  listClauseAnchorsForVersion,
  scheduleInternalAnalysisIngestion,
} from '../src/modules/compliance-doc-intelligence/service';
import {
  authorityRowXml,
  caseRowXml,
  driftedMasterBuffer,
  internalAnalysisMasterBuffer,
  legalRowXml,
  masterDocxBuffer,
  notADocxBuffer,
} from './helpers/complianceMasterDocxFixture';

const dbUrl = process.env.CLIENT_INTERACTION_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = dbUrl ? describe : describe.skip;

const SHARED_ANCHOR_KEY = 'LEGAL|SID=la_baa4796f2169';


describeWithDatabase('CDI-1 compliance document intelligence (vertical slice)', () => {
  const suffix = `${Date.now()}`;
  const adminId = `cdi-${suffix}`;
  const clientId = `cdi-client-${suffix}`;
  const caseId = `cdi-case-${suffix}`;
  const workspaceId = `cdi-ws-${suffix}`;
  const representativeId = `cdi-rep-${suffix}`;

  let internalDocumentId = '';
  let internalVersionId = '';
  let policyDocumentId = '';
  let policyVersionId = '';
  let unlinkedDocumentId = '';
  let unlinkedVersionId = '';

  const actor = () => ({ userId: adminId, role: 'ADMIN' });

  const createDocumentWithVersion = async (name: string, title: string) => {
    const document = await db.document.create({
      data: { clientId, caseId, name, title, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', category: 'EVIDENCE' } as never,
    });
    const version = await db.documentVersion.create({
      data: { documentId: document.id, version: 1, name: `${name} v1`, uploadedById: adminId, isCurrent: true, spItemId: `sp-${document.id}` } as never,
    });
    return { documentId: document.id, versionId: version.id };
  };

  const versionSubject = (documentId: string, versionId: string, spItemId: string | null) => ({
    id: versionId,
    documentId,
    spItemId,
  });

  const rowsForVersion = (documentVersionId: string) =>
    db.complianceDocumentClauseAnchor.findMany({
      where: { documentVersionId },
      orderBy: [{ clauseRef: 'asc' }, { id: 'asc' }],
    });

  const digestsForVersion = async (documentVersionId: string) =>
    (await rowsForVersion(documentVersionId)).map((row) => row.rowDigest).sort();

  /** Poll until an asynchronous (fire-and-forget) ingestion has materialised. */
  const waitFor = async (predicate: () => Promise<boolean>, timeoutMs = 6000): Promise<boolean> => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await predicate()) return true;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return predicate();
  };

  beforeAll(async () => {
    await db.user.create({
      data: { id: adminId, email: `cdi-${suffix}@fixture.invalid`, name: 'CDI Admin', role: 'ADMIN', status: 'ACTIVE', isActive: true, skills: [] } as never,
    });
    await db.client.create({ data: { id: clientId, name: 'CDI Client' } });
    await db.clientOperatingProfile.create({ data: { clientId, complianceEnrollmentStatus: 'ENROLLED' } });
    await db.clientPortalWorkspace.create({
      data: { id: workspaceId, clientId, name: 'CDI workspace', mode: 'ORGANIZATION', publicReference: `cdi-${suffix}`, createdById: adminId },
    });
    await db.clientPortalIdentity.create({
      data: {
        id: representativeId,
        provider: 'ENTRA_EXTERNAL_ID',
        issuer: `cdi-${suffix}`,
        subject: 'representative',
        normalizedEmail: `cdi-${suffix}@fixture.invalid`,
        emailVerifiedAt: new Date(),
        displayName: 'Representative',
        accountType: 'ORGANIZATION_MEMBER',
        status: 'ACTIVE',
      },
    });
    await db.clientPortalWorkspaceMembership.create({
      data: { id: randomUUID(), clientPortalIdentityId: representativeId, workspaceId, status: 'ACTIVE', role: 'REPRESENTATIVE', approvedAt: new Date(), approvedById: adminId },
    });
    await db.case.create({
      data: { id: caseId, caseNumber: `CDI-${suffix}`, title: 'CDI Case', caseType: 'OTHER', clientId, assignedLawyerId: adminId, createdById: adminId } as never,
    });

    const internal = await createDocumentWithVersion('GDPR belső elemzés', 'GDPR belső elemzés');
    internalDocumentId = internal.documentId;
    internalVersionId = internal.versionId;

    const policy = await createDocumentWithVersion('Adatkezelési szabályzat', 'Adatkezelési szabályzat');
    policyDocumentId = policy.documentId;
    policyVersionId = policy.versionId;

    const unlinked = await createDocumentWithVersion('Önálló compliance master', 'Önálló compliance master');
    unlinkedDocumentId = unlinked.documentId;
    unlinkedVersionId = unlinked.versionId;

    await provisionComplianceModuleRules(db, adminId);
    // Drive a real topic so the client-safe read model assertions are meaningful.
    await answerCompanyProfileQuestion(representativeId, workspaceId, 'personal_data_processing', { status: 'ANSWERED', booleanValue: true }, db);

    jest.spyOn(driveService, 'downloadDocument').mockImplementation(async () => internalAnalysisMasterBuffer());
  });

  afterAll(async () => {
    const versionIds = (await db.documentVersion.findMany({ where: { document: { clientId } }, select: { id: true } })).map((row) => row.id);
    await db.complianceDocumentClauseAnchor.deleteMany({ where: { documentVersionId: { in: versionIds } } });
    await db.clientDocumentPublication.deleteMany({ where: { clientId } });
    await db.complianceDocument.deleteMany({ where: { document: { clientId } } });
    await db.documentVersion.deleteMany({ where: { documentId: { in: [internalDocumentId, policyDocumentId, unlinkedDocumentId] } } });
    await db.document.deleteMany({ where: { id: { in: [internalDocumentId, policyDocumentId, unlinkedDocumentId] } } });
    await db.assessmentFinding.deleteMany({ where: { clientId } });
    await db.requirementApplicability.deleteMany({ where: { clientId } });
    await db.clientFactAnswerState.deleteMany({ where: { clientId } });
    await db.clientFact.deleteMany({ where: { clientId } });
    await db.clientPortalWorkspaceMembership.deleteMany({ where: { workspaceId } });
    await db.clientPortalIdentity.deleteMany({ where: { id: representativeId } });
    await db.clientPortalWorkspace.deleteMany({ where: { id: workspaceId } });
    await db.case.deleteMany({ where: { id: caseId } });
    await db.clientOperatingProfile.deleteMany({ where: { clientId } });
    await db.client.deleteMany({ where: { id: clientId } });
    await db.user.deleteMany({ where: { id: adminId } });
    jest.restoreAllMocks();
  });

  it('ingests one row per clause x anchor relation with exact machine metadata', async () => {
    const buffer = await internalAnalysisMasterBuffer();
    const result = await ingestClauseAnchorsForVersion(versionSubject(internalDocumentId, internalVersionId, null), buffer);

    expect(result.status).toBe('CREATED');
    expect(result.insertedRows).toBe(3);
    expect(result.warnings).toEqual([]);

    const rows = await rowsForVersion(internalVersionId);
    expect(rows).toHaveLength(3);

    const legal = rows.find((row) => row.clauseRef === '1.1.');
    expect(legal).toBeDefined();
    expect(legal!.anchorType).toBe('LEGAL');
    expect(legal!.relationType).toBe('MANDATORY_BASIS');
    expect(legal!.anchorDisplay).toBe('GDPR 28. cikk (3)');
    expect(legal!.anchorKey).toBe(SHARED_ANCHOR_KEY);
    expect(legal!.eli).toBe('http://data.europa.eu/eli/reg/2016/679/oj');
    expect(legal!.celex).toBe('32016R0679');
    expect(legal!.locator).toBe('art=28;par=3');
    expect(legal!.clauseStableId).toBe('cl_aa86615708d5');
    expect(legal!.rationale).toContain('controller-processor');
    expect(legal!.rowDigest).toMatch(/^[0-9a-f]{64}$/);

    const caseRow = rows.find((row) => row.clauseRef === '1.2.');
    expect(caseRow!.anchorType).toBe('CASE');
    expect(caseRow!.ecli).toBe('EU:C:2023:949');
    expect(caseRow!.caseId).toBe('105.K.703.714/2024/17');
    expect(caseRow!.caseLocator).toBe('paras=41-45');
  });

  it('is a no-op when the same DocumentVersion is ingested again', async () => {
    const before = await digestsForVersion(internalVersionId);
    const buffer = await internalAnalysisMasterBuffer();
    const result = await ingestClauseAnchorsForVersion(versionSubject(internalDocumentId, internalVersionId, null), buffer);

    expect(result.status).toBe('UNCHANGED');
    expect(result.insertedRows).toBe(0);
    expect(await digestsForVersion(internalVersionId)).toEqual(before);
  });

  it('returns INGEST_DRIFT and preserves provenance when the row set differs', async () => {
    const before = await digestsForVersion(internalVersionId);
    const buffer = await driftedMasterBuffer();
    const result = await ingestClauseAnchorsForVersion(versionSubject(internalDocumentId, internalVersionId, null), buffer);

    expect(result.status).toBe('INGEST_DRIFT');
    expect(result.code).toBe('INGEST_DRIFT');
    expect(result.insertedRows).toBe(0);
    // Nothing was deleted, replaced or updated.
    expect(await digestsForVersion(internalVersionId)).toEqual(before);
    expect((await rowsForVersion(internalVersionId)).find((row) => row.clauseRef === '1.1.')!.locator).toBe('art=28;par=3');
  });

  it('creates independent provenance for a new DocumentVersion', async () => {
    const previousDigests = await digestsForVersion(internalVersionId);
    const second = await db.documentVersion.create({
      data: { documentId: internalDocumentId, version: 2, name: 'GDPR belső elemzés v2', uploadedById: adminId, isCurrent: true, spItemId: `sp-${internalDocumentId}-2` } as never,
    });

    const buffer = await internalAnalysisMasterBuffer();
    const result = await ingestClauseAnchorsForVersion(versionSubject(internalDocumentId, second.id, null), buffer);
    expect(result.status).toBe('CREATED');
    expect(result.insertedRows).toBe(3);

    // The previous version keeps its own immutable row set.
    expect(await digestsForVersion(internalVersionId)).toEqual(previousDigests);
    expect((await rowsForVersion(second.id))).toHaveLength(3);
    expect((await rowsForVersion(second.id)).every((row) => row.documentVersionId === second.id)).toBe(true);
  });

  it('keeps one anchor reused by multiple clauses distinct and queryable', async () => {
    const rows = await rowsForVersion(internalVersionId);
    const shared = rows.filter((row) => row.anchorKey === SHARED_ANCHOR_KEY);
    expect(shared).toHaveLength(2);
    expect(new Set(shared.map((row) => row.clauseRef)).size).toBe(2);

    const references = await findClauseAnchorsByAnchorKey(SHARED_ANCHOR_KEY);
    expect(references.length).toBeGreaterThanOrEqual(2);
    expect(new Set(references.map((row) => row.clauseRef)).size).toBe(2);
  });

  it('does not ingest for a CLIENT_POLICY-only document and never loads its content', async () => {
    await linkComplianceDocument(actor(), {
      clientId,
      requirementKey: 'GDPR_GENERAL_SCOPE',
      documentId: policyDocumentId,
      audience: 'CLIENT_POLICY',
    });

    const loader = driveService.downloadDocument as unknown as jest.Mock;
    loader.mockClear();

    const direct = await ingestCurrentVersionForInternalAnalysisDocument(policyDocumentId);
    expect(direct.status).toBe('SKIPPED_NOT_INTERNAL_ANALYSIS');

    scheduleInternalAnalysisIngestion(policyDocumentId);
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(await rowsForVersion(policyVersionId)).toHaveLength(0);
    expect(loader).not.toHaveBeenCalled();
  });

  it('reports a bounded failure without throwing when the content is not a DOCX', async () => {
    const result = await ingestClauseAnchorsForVersion(
      versionSubject(internalDocumentId, internalVersionId, null),
      notADocxBuffer(),
    );
    expect(result.status).toBe('FAILED');
    expect(String(result.code)).toMatch(/^[A-Z_]+$/);
    // The existing provenance is untouched by a failed attempt.
    expect(await rowsForVersion(internalVersionId)).toHaveLength(3);
  });

  it('ingests the current version when a document becomes INTERNAL_ANALYSIS linked', async () => {
    await linkComplianceDocument(actor(), {
      clientId,
      requirementKey: 'GDPR_GENERAL_SCOPE',
      documentId: unlinkedDocumentId,
      audience: 'INTERNAL_ANALYSIS',
    });

    const materialised = await waitFor(async () => (await rowsForVersion(unlinkedVersionId)).length > 0);
    expect(materialised).toBe(true);
    const rows = await rowsForVersion(unlinkedVersionId);
    expect(rows).toHaveLength(3);
    expect(rows.some((row) => row.anchorType === 'AUTHORITY')).toBe(false);
  });

  it('ingests a newly uploaded version of an already-linked document', async () => {
    const second = await db.documentVersion.create({
      data: { documentId: unlinkedDocumentId, version: 2, name: 'Önálló compliance master v2', uploadedById: adminId, isCurrent: true, spItemId: `sp-${unlinkedDocumentId}-2` } as never,
    });
    const buffer = await masterDocxBuffer(legalRowXml() + authorityRowXml());

    // This is the call the document upload routes make after a version commit.
    scheduleInternalAnalysisIngestion(unlinkedDocumentId, { buffer });

    const materialised = await waitFor(async () => (await rowsForVersion(second.id)).length === 2);
    expect(materialised).toBe(true);
    const rows = await rowsForVersion(second.id);
    expect(rows.map((row) => row.anchorType).sort()).toEqual(['AUTHORITY', 'LEGAL']);
    // The older version of the same document keeps its own provenance.
    expect(await rowsForVersion(unlinkedVersionId)).toHaveLength(3);
  });

  it('keeps the linkage successful when ingestion cannot parse the document', async () => {
    const broken = await createDocumentWithVersion('Törött master', 'Törött master');
    const loader = driveService.downloadDocument as unknown as jest.Mock;
    loader.mockImplementationOnce(async () => notADocxBuffer());

    const link = await linkComplianceDocument(actor(), {
      clientId,
      requirementKey: 'GDPR_GENERAL_SCOPE',
      documentId: broken.documentId,
      audience: 'INTERNAL_ANALYSIS',
    });
    expect(link.id).toBeTruthy();

    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(await rowsForVersion(broken.versionId)).toHaveLength(0);

    await db.complianceDocument.deleteMany({ where: { documentId: broken.documentId } });
    await db.documentVersion.deleteMany({ where: { documentId: broken.documentId } });
    await db.document.deleteMany({ where: { id: broken.documentId } });
  });

  it('writes only the derived relation table and leaves existing compliance tables unchanged', async () => {
    const third = await db.documentVersion.create({
      data: { documentId: internalDocumentId, version: 3, name: 'GDPR belső elemzés v3', uploadedById: adminId, isCurrent: true, spItemId: `sp-${internalDocumentId}-3` } as never,
    });

    const countAll = async () => ({
      requirementCitation: await db.requirementCitation.count(),
      requirementVersion: await db.requirementVersion.count(),
      requirementApplicability: await db.requirementApplicability.count(),
      assessmentFinding: await db.assessmentFinding.count(),
      complianceDocument: await db.complianceDocument.count(),
      clientDocumentPublication: await db.clientDocumentPublication.count(),
      requirementControlMap: await db.requirementControlMap.count(),
      legalSourceVersion: await db.legalSourceVersion.count(),
      clientControl: await db.clientControl.count(),
      evidenceRecord: await db.evidenceRecord.count(),
    });

    const before = await countAll();
    const buffer = await internalAnalysisMasterBuffer();
    const result = await ingestClauseAnchorsForVersion(versionSubject(internalDocumentId, third.id, null), buffer);
    expect(result.status).toBe('CREATED');
    expect(await countAll()).toEqual(before);
  });

  it('never exposes internal anchor metadata through the client-safe compliance read model', async () => {
    // Publish a CLIENT_POLICY document so the topic surface is populated.
    await db.clientDocumentPublication.create({
      data: {
        caseId,
        clientId,
        documentId: policyDocumentId,
        documentVersionId: policyVersionId,
        status: 'PUBLISHED',
        clientFacingTitle: 'Adatkezelési és adatvédelmi szabályzat',
        preparedById: adminId,
        publishedAt: new Date(),
        audienceSnapshot: {},
        sourceFingerprint: 'cdi-isolation-test',
      } as never,
    });

    const read = await getClientSafeComplianceReadModel(clientId, true, false);
    const serialized = JSON.stringify(read);
    const gdpr = read.topics.find((topic) => topic.topicId === 'portal/gdpr-general-scope');
    expect(gdpr).toBeDefined();

    const rows = await rowsForVersion(internalVersionId);
    expect(rows.length).toBeGreaterThan(0);

    for (const forbidden of [
      'anchorKey',
      'anchorDisplay',
      'anchorStableId',
      'rowDigest',
      'ingestWarnings',
      'rationale',
      'GDPR 28. cikk (3)',
      SHARED_ANCHOR_KEY,
      'la_baa4796f2169',
      'http://data.europa.eu/eli/reg/2016/679/oj',
      '32016R0679',
      'art=28;par=3',
      'A controller-processor jogviszony kotelezo tartalma.',
      'compliance_document_clause_anchor',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }

    // The published client copy still shows up, and only through publication.
    expect(gdpr!.documents.some((document) => document.title === 'Adatkezelési és adatvédelmi szabályzat')).toBe(true);
  });
});
