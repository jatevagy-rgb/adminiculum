/**
 * BE_COMP_006 — durable INTERNAL_ANALYSIS processing.
 *
 * Requires PostgreSQL (same gate as the other compliance integration suites).
 * Without CLIENT_INTERACTION_TEST_DATABASE_URL / MIGRATION_REPLAY_DATABASE_URL
 * the suite is skipped, matching the repository convention.
 *
 * Content is supplied through the SharePoint content loader (spied in this
 * suite), so no real legal document and no external storage is involved.
 *
 * Covers the required real-PG acceptance contract:
 * - upload/link success stays separate from analysis state (PENDING row)
 * - process death + fresh-process recovery without re-uploading the source
 * - retry of the same version without duplicate anchors; succeeded retry
 *   idempotent
 * - concurrent retry: exactly one effective processor
 * - mandatory scan gate (SCAN_GATE_BLOCKED) + resume when the scan clears
 * - cross-client / cross-case denial
 * - failure inspectable with bounded metadata
 * - exact document-version identity (a newer version can never redirect a job)
 */
import { describe, it, beforeAll, afterAll, expect, jest } from '@jest/globals';
import { prisma as db } from '../src/prisma/prisma.service';
import { driveService } from '../src/modules/sharepoint';
import { provisionComplianceModuleRules } from '../src/modules/compliance/complianceModuleProvisioning';
import {
  claimAnalysisJob,
  enqueueAnalysisJobForCurrentVersion,
  listAnalysisJobsForDocument,
  processAnalysisJob,
  recoverPendingAnalysisJobs,
  resumeAnalysisJobsBlockedByScan,
  retryAnalysisForDocument,
  INTERNAL_PROCESSING_ERROR_CODE,
  SCAN_GATE_BLOCKED_CODE,
} from '../src/modules/compliance-doc-intelligence/analysisJobService';
import {
  internalAnalysisMasterBuffer,
  legalRowXml,
  masterDocxBuffer,
  notADocxBuffer,
} from './helpers/complianceMasterDocxFixture';

const dbUrl = process.env.CLIENT_INTERACTION_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = dbUrl ? describe : describe.skip;

describeWithDatabase('BE_COMP_006 durable internal analysis processing (vertical slice)', () => {
  const suffix = `${Date.now()}`;
  const adminId = `cda-${suffix}`;
  const clientId = `cda-client-${suffix}`;
  const otherClientId = `cda-other-client-${suffix}`;
  const caseId = `cda-case-${suffix}`;

  const actor = () => ({ userId: adminId, role: 'ADMIN' });

  let requirementId = '';
  const createdDocumentIds: string[] = [];

  const rowsForVersion = (documentVersionId: string) =>
    db.complianceDocumentClauseAnchor.findMany({
      where: { documentVersionId },
      orderBy: [{ clauseRef: 'asc' }, { id: 'asc' }],
    });

  const jobsForDocument = (documentId: string) =>
    db.complianceAnalysisJob.findMany({ where: { documentId }, orderBy: { enqueuedAt: 'asc' } });

  const linkInternalAnalysis = async (documentId: string) => {
    await db.complianceDocument.create({
      data: { requirementId, documentId, audience: 'INTERNAL_ANALYSIS' } as never,
    });
  };

  const createDocumentWithVersion = async (
    name: string,
    overrides: { securityScanStatus?: string } = {},
  ) => {
    const document = await db.document.create({
      data: { clientId, caseId, name, title: name, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', category: 'EVIDENCE' } as never,
    });
    createdDocumentIds.push(document.id);
    const version = await db.documentVersion.create({
      data: {
        documentId: document.id,
        version: 1,
        name: `${name} v1`,
        uploadedById: adminId,
        isCurrent: true,
        spItemId: `sp-${document.id}`,
        securityScanStatus: overrides.securityScanStatus ?? 'CLEAN',
      } as never,
    });
    return { documentId: document.id, versionId: version.id };
  };

  const addDocumentVersion = async (documentId: string, version: number, name: string) => {
    await db.documentVersion.updateMany({ where: { documentId, isCurrent: true }, data: { isCurrent: false } });
    return db.documentVersion.create({
      data: {
        documentId,
        version,
        name,
        uploadedById: adminId,
        isCurrent: true,
        spItemId: `sp-${documentId}-${version}`,
      } as never,
    });
  };

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
      data: { id: adminId, email: `cda-${suffix}@fixture.invalid`, name: 'CDA Admin', role: 'ADMIN', status: 'ACTIVE', isActive: true, skills: [] } as never,
    });
    await db.client.create({ data: { id: clientId, name: 'CDA Client' } });
    await db.client.create({ data: { id: otherClientId, name: 'CDA Other Client' } });
    await db.case.create({
      data: { id: caseId, caseNumber: `CDA-${suffix}`, title: 'CDA Case', caseType: 'OTHER', clientId, assignedLawyerId: adminId, createdById: adminId } as never,
    });
    await provisionComplianceModuleRules(db, adminId);
    const requirement = await db.requirement.findUnique({ where: { key: 'GDPR_GENERAL_SCOPE' }, select: { id: true } });
    requirementId = requirement!.id;
    jest.spyOn(driveService, 'downloadDocument').mockImplementation(async () => internalAnalysisMasterBuffer());
  });

  afterAll(async () => {
    const versionIds = (await db.documentVersion.findMany({ where: { documentId: { in: createdDocumentIds } }, select: { id: true } })).map((row) => row.id);
    await db.complianceDocumentClauseAnchor.deleteMany({ where: { documentVersionId: { in: versionIds } } });
    await db.complianceAnalysisJob.deleteMany({ where: { documentId: { in: createdDocumentIds } } });
    await db.complianceDocument.deleteMany({ where: { document: { clientId: clientId } } });
    await db.documentVersion.deleteMany({ where: { documentId: { in: createdDocumentIds } } });
    await db.document.deleteMany({ where: { id: { in: createdDocumentIds } } });
    await db.case.deleteMany({ where: { id: caseId } });
    await db.client.deleteMany({ where: { id: { in: [clientId, otherClientId] } } });
    await db.user.deleteMany({ where: { id: adminId } });
    jest.restoreAllMocks();
  });

  it('separates upload/link state from analysis state: enqueue persists PENDING and never processes by itself', async () => {
    const { documentId, versionId } = await createDocumentWithVersion('Durable master A');
    await linkInternalAnalysis(documentId);

    const enqueued = await enqueueAnalysisJobForCurrentVersion(documentId, { audienceConfirmedInternal: true });
    expect(enqueued.status).toBe('ENQUEUED');
    expect(enqueued.jobId).toBeTruthy();

    const jobs = await jobsForDocument(documentId);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe('PENDING');
    expect(jobs[0].documentVersionId).toBe(versionId);

    // Enqueue success is NOT processing success: nothing was extracted yet.
    expect(await rowsForVersion(versionId)).toHaveLength(0);
  });

  it('recovers PENDING work in a fresh process from the version storage reference (no re-upload)', async () => {
    const { documentId, versionId } = await createDocumentWithVersion('Durable master B');
    await linkInternalAnalysis(documentId);
    await enqueueAnalysisJobForCurrentVersion(documentId, { audienceConfirmedInternal: true });

    const loader = driveService.downloadDocument as unknown as jest.Mock;
    loader.mockClear();

    // Simulate process death + fresh process boot: only the persisted job exists.
    const recovery = await recoverPendingAnalysisJobs();
    expect(recovery.recovered).toBeGreaterThanOrEqual(1);

    const jobs = await jobsForDocument(documentId);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe('SUCCEEDED');
    expect(jobs[0].lastIngestStatus).toBe('CREATED');
    expect(await rowsForVersion(versionId)).toHaveLength(3);
    // The source was re-loaded from the version's SharePoint reference.
    expect(loader).toHaveBeenCalledWith(`sp-${documentId}`);
  });

  it('reclaims a stale RUNNING job whose lease expired (process death mid-processing)', async () => {
    const { documentId, versionId } = await createDocumentWithVersion('Durable master C');
    await linkInternalAnalysis(documentId);
    const enqueued = await enqueueAnalysisJobForCurrentVersion(documentId, { audienceConfirmedInternal: true });

    await db.complianceAnalysisJob.update({
      where: { id: enqueued.jobId! },
      data: { status: 'RUNNING', leaseExpiresAt: new Date(Date.now() - 60_000) },
    });

    await recoverPendingAnalysisJobs();

    const jobs = await jobsForDocument(documentId);
    expect(jobs[0].status).toBe('SUCCEEDED');
    expect(jobs[0].attemptCount).toBe(1);
    expect(await rowsForVersion(versionId)).toHaveLength(3);
  });

  it('retries the SAME version without duplicate anchors and a succeeded retry is idempotent', async () => {
    const { documentId, versionId } = await createDocumentWithVersion('Durable master D');
    await linkInternalAnalysis(documentId);
    const enqueued = await enqueueAnalysisJobForCurrentVersion(documentId, { audienceConfirmedInternal: true });

    // First attempt fails on an unreadable document.
    await processAnalysisJob(enqueued.jobId!, { buffer: notADocxBuffer() });
    let job = await db.complianceAnalysisJob.findUnique({ where: { id: enqueued.jobId! } });
    expect(job!.status).toBe('FAILED');
    expect(job!.lastErrorCode).toBe('DOCX_PACKAGE_UNREADABLE');
    expect(await rowsForVersion(versionId)).toHaveLength(0);

    // Retry re-runs the exact same version through the digest-idempotent ingest.
    const retried = await retryAnalysisForDocument(documentId, clientId);
    expect(retried.status).toBe('ENQUEUED');
    const materialised = await waitFor(async () => (await rowsForVersion(versionId)).length === 3);
    expect(materialised).toBe(true);
    const finished = await waitFor(async () => {
      const current = await db.complianceAnalysisJob.findUnique({ where: { id: enqueued.jobId! } });
      return current?.status === 'SUCCEEDED';
    });
    expect(finished).toBe(true);

    // Retrying the succeeded job is a no-op: no new rows, no new job.
    const again = await retryAnalysisForDocument(documentId, clientId);
    expect(again.status).toBe('ALREADY_SUCCEEDED');
    expect(await rowsForVersion(versionId)).toHaveLength(3);
    expect(await jobsForDocument(documentId)).toHaveLength(1);
  });

  it('concurrent retry leaves exactly one effective processor', async () => {
    const { documentId, versionId } = await createDocumentWithVersion('Durable master E');
    await linkInternalAnalysis(documentId);
    const enqueued = await enqueueAnalysisJobForCurrentVersion(documentId, { audienceConfirmedInternal: true });

    const slowBuffer = internalAnalysisMasterBuffer();
    const slowLoader = jest.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return slowBuffer;
    });

    const [first, second] = await Promise.all([
      processAnalysisJob(enqueued.jobId!, {}, { loadVersionContent: slowLoader }),
      processAnalysisJob(enqueued.jobId!, {}, { loadVersionContent: slowLoader }),
    ]);

    const claimed = [first, second].filter((outcome) => outcome.claimed);
    expect(claimed).toHaveLength(1);

    const job = await db.complianceAnalysisJob.findUnique({ where: { id: enqueued.jobId! } });
    expect(job!.status).toBe('SUCCEEDED');
    expect(job!.attemptCount).toBe(1);
    expect(await rowsForVersion(versionId)).toHaveLength(3);

    // A claimed job is not claimable again while its lease is fresh.
    const reClaim = await claimAnalysisJob(enqueued.jobId!);
    expect(reClaim).toBeNull();
  });

  it('enforces the mandatory scan gate and resumes when the scan clears', async () => {
    const { documentId, versionId } = await createDocumentWithVersion('Durable master F', { securityScanStatus: 'PENDING_SCAN' });
    await linkInternalAnalysis(documentId);
    const enqueued = await enqueueAnalysisJobForCurrentVersion(documentId, { audienceConfirmedInternal: true });

    const loader = driveService.downloadDocument as unknown as jest.Mock;
    loader.mockClear();

    const blocked = await processAnalysisJob(enqueued.jobId!);
    expect(blocked.claimed).toBe(true);
    const job = await db.complianceAnalysisJob.findUnique({ where: { id: enqueued.jobId! } });
    expect(job!.status).toBe('FAILED');
    expect(job!.lastErrorCode).toBe(SCAN_GATE_BLOCKED_CODE);
    // The gate runs before any content is loaded.
    expect(loader).not.toHaveBeenCalled();
    expect(await rowsForVersion(versionId)).toHaveLength(0);

    // The canonical scan completion path flips the version CLEAN and resumes.
    await db.documentVersion.update({ where: { id: versionId }, data: { securityScanStatus: 'CLEAN' } });
    const resumed = await resumeAnalysisJobsBlockedByScan(versionId);
    expect(resumed).toBe(1);

    const materialised = await waitFor(async () => (await rowsForVersion(versionId)).length === 3);
    expect(materialised).toBe(true);
    const finished = await waitFor(async () => {
      const current = await db.complianceAnalysisJob.findUnique({ where: { id: enqueued.jobId! } });
      return current?.status === 'SUCCEEDED';
    });
    expect(finished).toBe(true);
    expect(await db.complianceAnalysisJob.findUnique({ where: { id: enqueued.jobId! } })).toMatchObject({ lastIngestStatus: 'CREATED' });
  });

  it('denies cross-client and cross-case access to analysis state and retry', async () => {
    const { documentId } = await createDocumentWithVersion('Durable master G');
    await linkInternalAnalysis(documentId);
    await enqueueAnalysisJobForCurrentVersion(documentId, { audienceConfirmedInternal: true });

    await expect(listAnalysisJobsForDocument(documentId, otherClientId)).rejects.toMatchObject({
      code: 'COMPLIANCE_ANALYSIS_DOCUMENT_NOT_FOUND',
    });
    await expect(retryAnalysisForDocument(documentId, otherClientId)).rejects.toMatchObject({
      code: 'COMPLIANCE_ANALYSIS_DOCUMENT_NOT_FOUND',
    });
  });

  it('never enqueues for a CLIENT_POLICY-only document and never loads its content', async () => {
    const { documentId } = await createDocumentWithVersion('Durable policy master');
    await db.complianceDocument.create({
      data: { requirementId, documentId, audience: 'CLIENT_POLICY' } as never,
    });

    const loader = driveService.downloadDocument as unknown as jest.Mock;
    loader.mockClear();

    const enqueued = await enqueueAnalysisJobForCurrentVersion(documentId);
    expect(enqueued.status).toBe('SKIPPED_NOT_INTERNAL_ANALYSIS');
    expect(await jobsForDocument(documentId)).toHaveLength(0);
    expect(loader).not.toHaveBeenCalled();
  });

  it('re-verifies the audience at processing time: unlinked documents write nothing', async () => {
    const { documentId, versionId } = await createDocumentWithVersion('Durable master H');
    await linkInternalAnalysis(documentId);
    const enqueued = await enqueueAnalysisJobForCurrentVersion(documentId, { audienceConfirmedInternal: true });

    const loader = driveService.downloadDocument as unknown as jest.Mock;
    loader.mockClear();

    await db.complianceDocument.deleteMany({ where: { documentId } });

    const outcome = await processAnalysisJob(enqueued.jobId!);
    expect(outcome.claimed).toBe(true);
    const job = await db.complianceAnalysisJob.findUnique({ where: { id: enqueued.jobId! } });
    expect(job!.status).toBe('SUCCEEDED');
    expect(job!.lastIngestStatus).toBe('SKIPPED_NOT_INTERNAL_ANALYSIS');
    expect(await rowsForVersion(versionId)).toHaveLength(0);
    expect(loader).not.toHaveBeenCalled();
  });

  it('keeps failure metadata inspectable and bounded (no content, bounded detail)', async () => {
    const { documentId } = await createDocumentWithVersion('Durable master I');
    await linkInternalAnalysis(documentId);
    const enqueued = await enqueueAnalysisJobForCurrentVersion(documentId, { audienceConfirmedInternal: true });

    const exploding = new Proxy(db, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (prop === 'complianceDocumentClauseAnchor') {
          return new Proxy(value, {
            get(inner, innerProp) {
              const innerValue = Reflect.get(inner, innerProp);
              if (innerProp === 'findMany') {
                return () => {
                  throw new Error(`SENSITIVE-LIBRARY-DETAIL ${'x'.repeat(600)}`);
                };
              }
              return innerValue;
            },
          });
        }
        return value;
      },
    });

    const outcome = await processAnalysisJob(enqueued.jobId!, {}, { prisma: exploding });
    expect(outcome.claimed).toBe(true);
    const job = await db.complianceAnalysisJob.findUnique({ where: { id: enqueued.jobId! } });
    expect(job!.status).toBe('FAILED');
    expect(job!.lastErrorCode).toBe(INTERNAL_PROCESSING_ERROR_CODE);
    const expectedDetail = `SENSITIVE-LIBRARY-DETAIL ${'x'.repeat(600)}`.slice(0, 300);
    expect(job!.lastErrorDetail).toBe(expectedDetail);
    expect(job!.lastErrorDetail!.length).toBeLessThanOrEqual(300);
  });

  it('pins exact version identity at enqueue: a newer current version can never redirect the job', async () => {
    const { documentId, versionId } = await createDocumentWithVersion('Durable master J');
    await linkInternalAnalysis(documentId);
    await enqueueAnalysisJobForCurrentVersion(documentId, { audienceConfirmedInternal: true });

    // A newer version arrives after enqueue and becomes current.
    const second = await addDocumentVersion(documentId, 2, 'Durable master J v2');
    const loader = driveService.downloadDocument as unknown as jest.Mock;
    loader.mockImplementation(async (spItemId: string) =>
      spItemId === `sp-${documentId}` ? internalAnalysisMasterBuffer() : masterDocxBuffer(legalRowXml()),
    );

    await recoverPendingAnalysisJobs();

    // The pinned version was processed; the newer version was not redirected to.
    expect(await rowsForVersion(versionId)).toHaveLength(3);
    expect(await rowsForVersion(second.id)).toHaveLength(0);
    const jobs = await jobsForDocument(documentId);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].documentVersionId).toBe(versionId);
  });
});
