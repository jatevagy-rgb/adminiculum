import { PrismaClient } from '@prisma/client';

import { createOrGetComparison } from '../src/modules/documents/comparison/comparisonService';
import { listSegments, linkSegmentTask, updateSegment } from '../src/modules/documents/comparison/comparisonReadService';

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
});
