import { PrismaClient } from '@prisma/client';
import { Document, Packer, Paragraph, TextRun } from 'docx';

import { createOrGetComparison } from '../src/modules/documents/comparison/comparisonService';
import { listSegments, linkSegmentTask, updateSegment } from '../src/modules/documents/comparison/comparisonReadService';
import { resolveVersionText } from '../src/modules/documents/comparison/versionText';

const databaseUrl = process.env.COMPARISON_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const ids = {
  user: 'c1000000-0000-4000-8000-000000000001',
  client: 'c2000000-0000-4000-8000-000000000001',
  case: 'c3000000-0000-4000-8000-000000000001',
  document: 'c4000000-0000-4000-8000-000000000001',
  baseVersion: 'c5000000-0000-4000-8000-000000000001',
  targetVersion: 'c5000000-0000-4000-8000-000000000002',
  task: 'c6000000-0000-4000-8000-000000000001',
};

describeWithDatabase('Comparison PostgreSQL persistence lifecycle', () => {
  let db: PrismaClient;

  beforeAll(async () => {
    const parsed = new URL(databaseUrl as string);
    expect(['127.0.0.1', 'localhost', '::1']).toContain(parsed.hostname);
    expect(parsed.pathname.replace(/^\//, '')).toMatch(/^adminiculum_replay_ci$/);

    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.$connect();

    const identity = await db.$queryRaw<Array<{ database_name: string }>>`SELECT current_database() AS database_name`;
    expect(identity[0].database_name).toBe('adminiculum_replay_ci');

    await db.user.create({
      data: {
        id: ids.user,
        email: 'comparison-persistence@example.invalid',
        name: 'Comparison Persistence User',
        role: 'LAWYER',
        status: 'ACTIVE',
        isActive: true,
        skills: [],
      },
    });
    await db.client.create({
      data: { id: ids.client, name: 'Synthetic comparison client' },
    });
    await db.case.create({
      data: {
        id: ids.case,
        caseNumber: 'CMP-BACKEND-001',
        title: 'Synthetic comparison case',
        caseType: 'CONTRACT_REVIEW',
        clientId: ids.client,
        createdById: ids.user,
        assignedLawyerId: ids.user,
      },
    });
    await db.document.create({
      data: {
        id: ids.document,
        name: 'Synthetic comparison document',
        fileName: 'comparison.txt',
        category: 'CONTRACT',
        documentType: 'CONTRACT',
        mimeType: 'text/plain',
        caseId: ids.case,
        clientId: ids.client,
        currentVersion: 2,
        currentVersionInt: 2,
        version: '2',
      },
    });
    await db.documentVersion.createMany({
      data: [
        {
          id: ids.baseVersion,
          documentId: ids.document,
          version: 1,
          name: 'comparison-v1.txt',
          originalFileName: 'comparison-v1.txt',
          mimeType: 'text/plain',
          size: 20,
          storageReference: 'comparison-v1',
          spItemId: 'comparison-v1',
          isCurrent: false,
          uploadSource: 'LAWYER_UPLOAD',
          versionType: 'ORIGINAL',
          uploadedById: ids.user,
        },
        {
          id: ids.targetVersion,
          documentId: ids.document,
          version: 2,
          name: 'comparison-v2.txt',
          originalFileName: 'comparison-v2.txt',
          mimeType: 'text/plain',
          size: 25,
          storageReference: 'comparison-v2',
          spItemId: 'comparison-v2',
          isCurrent: true,
          uploadSource: 'LAWYER_UPLOAD',
          versionType: 'WORKING_COPY',
          uploadedById: ids.user,
          previousVersionId: ids.baseVersion,
        },
      ],
    });
    await db.task.create({
      data: {
        id: ids.task,
        title: 'Review comparison change',
        taskType: 'REVIEW_CONTRACT',
        status: 'PENDING',
        priority: 'MEDIUM',
        caseId: ids.case,
        assignedToId: ids.user,
        assignedById: ids.user,
        requiredSkills: [],
      },
    });
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  it('persists a generated comparison and reuses the same version pair idempotently', async () => {
    const comparison = await createOrGetComparison({
      actorId: ids.user,
      documentId: ids.document,
      baseVersionId: ids.baseVersion,
      targetVersionId: ids.targetVersion,
    }, {
      prisma: db,
      resolveText: async (version) => ({
        supported: true,
        text: version.id === ids.baseVersion ? 'Alpha\n\nA dij 100 EUR.\n\nTorolni' : 'Alpha\n\nA dij 250 EUR.',
        reasonCode: null,
        extractionRevision: 1,
      }),
    });

    expect(comparison.status).toBe('READY');
    expect(comparison.totalSegmentCount).toBeGreaterThan(0);
    expect(comparison.completedAt).toBeInstanceOf(Date);

    const stored = await db.documentComparison.findUniqueOrThrow({
      where: { id: comparison.id },
      include: { segments: { orderBy: { sequence: 'asc' } } },
    });
    expect(stored.segments).toHaveLength(comparison.totalSegmentCount);
    expect(stored.segments.map((segment) => segment.sequence)).toEqual(
      stored.segments.map((segment) => segment.sequence).sort((left, right) => left - right),
    );

    const reused = await createOrGetComparison({
      actorId: ids.user,
      documentId: ids.document,
      baseVersionId: ids.baseVersion,
      targetVersionId: ids.targetVersion,
    }, {
      prisma: db,
      resolveText: async () => {
        throw new Error('idempotent comparison should not resolve text again');
      },
    });
    expect(reused.id).toBe(comparison.id);
    expect(await db.documentComparison.count({ where: { documentId: ids.document } })).toBe(1);
  });

  it('updates segment review state and links a task with optimistic revision checks', async () => {
    const comparison = await db.documentComparison.findFirstOrThrow({ where: { documentId: ids.document } });
    const listed = await listSegments(comparison.id, { limit: 10 }, db);
    const segment = listed.items[0];
    expect(segment).toBeDefined();

    const updated = await updateSegment(comparison.id, segment.id, {
      reviewState: 'ACCEPTED',
      category: 'AMOUNT',
      internalRationale: 'Amount changed from 100 EUR to 250 EUR.',
      expectedRevision: segment.revision,
    }, db);
    expect(updated.reviewState).toBe('ACCEPTED');
    expect(updated.category).toBe('AMOUNT');
    expect(updated.revision).toBe(segment.revision + 1);

    const reviewedComparison = await db.documentComparison.findUniqueOrThrow({ where: { id: comparison.id } });
    expect(reviewedComparison.reviewedSegmentCount).toBe(1);

    await expect(updateSegment(comparison.id, segment.id, {
      reviewState: 'REJECTED',
      expectedRevision: segment.revision,
    }, db)).rejects.toMatchObject({ code: 'REVISION_CONFLICT', status: 409 });

    const linked = await linkSegmentTask(comparison.id, segment.id, ids.task, db);
    expect(linked.linkedTaskId).toBe(ids.task);
    expect(linked.revision).toBe(updated.revision + 1);
  });

  it('cascades comparison segments when the comparison is deleted', async () => {
    const comparison = await db.documentComparison.findFirstOrThrow({ where: { documentId: ids.document } });
    expect(await db.documentChangeSegment.count({ where: { comparisonId: comparison.id } })).toBeGreaterThan(0);

    await db.documentComparison.delete({ where: { id: comparison.id } });

    expect(await db.documentChangeSegment.count({ where: { comparisonId: comparison.id } })).toBe(0);
  });

  it('persists a comparison generated from DOCX versions with real text extraction in Postgres', async () => {
    const docxDocId = 'c4000000-0000-4000-8000-000000000002';
    const v1Id = 'c5000000-0000-4000-8000-000000000003';
    const v2Id = 'c5000000-0000-4000-8000-000000000004';

    await db.document.create({
      data: {
        id: docxDocId,
        name: 'Synthetic DOCX comparison document',
        fileName: 'contract.docx',
        category: 'CONTRACT',
        documentType: 'CONTRACT',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        caseId: ids.case,
        clientId: ids.client,
        currentVersion: 2,
        currentVersionInt: 2,
        version: '2',
      },
    });

    await db.documentVersion.createMany({
      data: [
        {
          id: v1Id,
          documentId: docxDocId,
          version: 1,
          name: 'contract-v1.docx',
          originalFileName: 'contract-v1.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: 1000,
          storageReference: 'docx-v1',
          spItemId: 'docx-v1',
          isCurrent: false,
          uploadSource: 'LAWYER_UPLOAD',
          versionType: 'ORIGINAL',
          uploadedById: ids.user,
        },
        {
          id: v2Id,
          documentId: docxDocId,
          version: 2,
          name: 'contract-v2.docx',
          originalFileName: 'contract-v2.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: 1000,
          storageReference: 'docx-v2',
          spItemId: 'docx-v2',
          isCurrent: true,
          uploadSource: 'LAWYER_UPLOAD',
          versionType: 'WORKING_COPY',
          uploadedById: ids.user,
          previousVersionId: v1Id,
        },
      ],
    });

    const doc1 = new Document({
      sections: [{ children: [new Paragraph({ children: [new TextRun('Bekezdés 1: Szerződéses feltételek.')] }), new Paragraph({ children: [new TextRun('Bekezdés 2: Díj 100 EUR.')] })] }],
    });
    const doc2 = new Document({
      sections: [{ children: [new Paragraph({ children: [new TextRun('Bekezdés 1: Szerződéses feltételek.')] }), new Paragraph({ children: [new TextRun('Bekezdés 2: Díj 250 EUR.')] })] }],
    });

    const docxBuf1 = await Packer.toBuffer(doc1);
    const docxBuf2 = await Packer.toBuffer(doc2);

    const comparison = await createOrGetComparison({
      actorId: ids.user,
      documentId: docxDocId,
      baseVersionId: v1Id,
      targetVersionId: v2Id,
    }, {
      prisma: db,
      resolveText: async (v) => resolveVersionText(v, async (_docId, versionId) => (versionId === v1Id ? docxBuf1 : docxBuf2)),
    });

    expect(comparison.status).toBe('READY');
    expect(comparison.replaceCount).toBe(1);
    expect(comparison.totalSegmentCount).toBe(1);

    const stored = await db.documentComparison.findUniqueOrThrow({
      where: { id: comparison.id },
      include: { segments: true },
    });
    expect(stored.segments).toHaveLength(1);
    expect(stored.segments[0].changeType).toBe('REPLACE');
    expect(stored.segments[0].baseExcerpt).toContain('100 EUR');
    expect(stored.segments[0].targetExcerpt).toContain('250 EUR');
  });

  it('recomputes stale extractionRevision 1 comparison row to revision 2 in PostgreSQL', async () => {
    const staleDocId = 'c4000000-0000-4000-8000-000000000099';
    const v1Id = 'c5000000-0000-4000-8000-000000000091';
    const v2Id = 'c5000000-0000-4000-8000-000000000092';

    await db.document.create({
      data: {
        id: staleDocId,
        name: 'Stale revision doc',
        fileName: 'contract-stale.docx',
        category: 'CONTRACT',
        documentType: 'CONTRACT',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        caseId: ids.case,
        clientId: ids.client,
        currentVersion: 2,
        currentVersionInt: 2,
        version: '2',
      },
    });

    await db.documentVersion.createMany({
      data: [
        {
          id: v1Id,
          documentId: staleDocId,
          version: 1,
          name: 'stale-v1.docx',
          originalFileName: 'stale-v1.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: 500,
          storageReference: 'stale-v1',
          spItemId: 'stale-v1',
          isCurrent: false,
          uploadSource: 'LAWYER_UPLOAD',
          versionType: 'ORIGINAL',
          uploadedById: ids.user,
        },
        {
          id: v2Id,
          documentId: staleDocId,
          version: 2,
          name: 'stale-v2.docx',
          originalFileName: 'stale-v2.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: 600,
          storageReference: 'stale-v2',
          spItemId: 'stale-v2',
          isCurrent: true,
          uploadSource: 'LAWYER_UPLOAD',
          versionType: 'WORKING_COPY',
          uploadedById: ids.user,
          previousVersionId: v1Id,
        },
      ],
    });

    // Seed old revision-1 comparison with UNSUPPORTED state
    const staleComparison = await db.documentComparison.create({
      data: {
        documentId: staleDocId,
        baseVersionId: v1Id,
        targetVersionId: v2Id,
        algorithmRevision: 1,
        extractionRevision: 1, // OLD REVISION 1
        createdById: ids.user,
        status: 'UNSUPPORTED',
        failureCode: 'FORMAT_NOT_TEXT_EXTRACTABLE',
        failureMessageSafe: 'Format not supported in rev1',
      },
    });
    expect(staleComparison.extractionRevision).toBe(1);
    expect(staleComparison.status).toBe('UNSUPPORTED');

    const docxBuf = await Packer.toBuffer(
      new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun('Szerződés szöveg rev2.')] })] }] })
    );

    // Invoke createOrGetComparison with current revision-2 service
    const recomputed = await createOrGetComparison(
      {
        actorId: ids.user,
        documentId: staleDocId,
        baseVersionId: v1Id,
        targetVersionId: v2Id,
      },
      {
        prisma: db,
        resolveText: async (v) => resolveVersionText(v, async () => docxBuf),
      }
    );

    // Prove that old UNSUPPORTED result was NOT returned as-is
    expect(recomputed.status).toBe('IDENTICAL');
    expect(recomputed.extractionRevision).toBe(2);
    expect(recomputed.failureCode).toBeNull();

    // Verify database row was updated in-place with extractionRevision: 2
    const stored = await db.documentComparison.findUniqueOrThrow({
      where: { id: staleComparison.id },
    });
    expect(stored.extractionRevision).toBe(2);
    expect(stored.status).toBe('IDENTICAL');
    expect(stored.failureCode).toBeNull();
  });
});
