import { Prisma, PrismaClient } from '@prisma/client';

const databaseUrl = process.env.DOCUMENT_VERSION_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const ids = {
  user: 'd1000000-0000-4000-8000-000000000001',
  client: 'd2000000-0000-4000-8000-000000000001',
  crossClient: 'd2000000-0000-4000-8000-000000000002',
  case: 'd3000000-0000-4000-8000-000000000001',
  crossCase: 'd3000000-0000-4000-8000-000000000002',
  document: 'd4000000-0000-4000-8000-000000000001',
  crossDocument: 'd4000000-0000-4000-8000-000000000002',
};

const isSerializationConflict = (error: unknown): boolean => {
  const metaCode = error instanceof Prisma.PrismaClientKnownRequestError
    ? String((error.meta as { code?: unknown } | undefined)?.code || '')
    : '';
  return error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2034' || error.code === 'P2028' || error.code === 'P2010' || metaCode === '40001');
};

describeWithDatabase('DocumentVersion PostgreSQL persistence invariants', () => {
  let db: PrismaClient;

  beforeAll(async () => {
    const parsed = new URL(databaseUrl as string);
    if (process.env.ALLOW_AZURE_DISPOSABLE_DB === 'true') {
      expect(parsed.hostname).toMatch(/postgres\.database\.azure\.com$/);
    } else {
      expect(['127.0.0.1', 'localhost', '::1']).toContain(parsed.hostname);
    }
    expect(parsed.pathname.replace(/^\//, '')).toMatch(/^adminiculum_document_versions_backend_/);

    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.$connect();
    const identity = await db.$queryRaw<Array<{ database_name: string }>>`SELECT current_database() AS database_name`;
    expect(identity[0].database_name).toBe(parsed.pathname.replace(/^\//, ''));

    await db.user.create({
      data: { id: ids.user, email: 'document-version-user@example.invalid', name: 'Document Version User', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
    });
    await db.client.createMany({
      data: [
        { id: ids.client, name: 'Synthetic document version client' },
        { id: ids.crossClient, name: 'Synthetic document version cross client' },
      ],
    });
    await db.case.createMany({
      data: [
        { id: ids.case, caseNumber: 'DV-BACKEND-001', title: 'Synthetic version case', caseType: 'CONTRACT_REVIEW', clientId: ids.client, createdById: ids.user, assignedLawyerId: ids.user },
        { id: ids.crossCase, caseNumber: 'DV-BACKEND-002', title: 'Synthetic version cross case', caseType: 'CONTRACT_REVIEW', clientId: ids.crossClient, createdById: ids.user, assignedLawyerId: ids.user },
      ],
    });
    await db.document.createMany({
      data: [
        {
          id: ids.document,
          name: 'Synthetic immutable document',
          fileName: 'synthetic.txt',
          category: 'CONTRACT',
          documentType: 'CONTRACT',
          mimeType: 'text/plain',
          caseId: ids.case,
          clientId: ids.client,
          currentVersion: 1,
          currentVersionInt: 1,
          version: '1',
        },
        {
          id: ids.crossDocument,
          name: 'Synthetic cross immutable document',
          fileName: 'cross.txt',
          category: 'CONTRACT',
          documentType: 'CONTRACT',
          mimeType: 'text/plain',
          caseId: ids.crossCase,
          clientId: ids.crossClient,
          currentVersion: 1,
          currentVersionInt: 1,
          version: '1',
        },
      ],
    });
    await db.documentVersion.createMany({
      data: [
        {
          documentId: ids.document,
          version: 1,
          name: 'synthetic.txt',
          originalFileName: 'synthetic.txt',
          mimeType: 'text/plain',
          size: 3,
          storageReference: 'storage-v1',
          spItemId: 'storage-v1',
          isCurrent: true,
          reviewStatus: 'IN_REVIEW',
          publicationStatus: 'INTERNAL_ONLY',
          uploadSource: 'LAWYER_UPLOAD',
          versionType: 'ORIGINAL',
          uploadedById: ids.user,
        },
        {
          documentId: ids.crossDocument,
          version: 1,
          name: 'cross.txt',
          originalFileName: 'cross.txt',
          mimeType: 'text/plain',
          size: 5,
          storageReference: 'cross-storage-v1',
          spItemId: 'cross-storage-v1',
          isCurrent: true,
          reviewStatus: 'NOT_IN_REVIEW',
          publicationStatus: 'INTERNAL_ONLY',
          uploadSource: 'LAWYER_UPLOAD',
          versionType: 'ORIGINAL',
          uploadedById: ids.user,
        },
      ],
    });
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  const uploadVersion = async (documentId: string, storageReference: string) => {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "documents" WHERE "id" = ${documentId} FOR UPDATE`;
          const latest = await tx.documentVersion.findFirst({
            where: { documentId },
            orderBy: { version: 'desc' },
            select: { id: true, version: true },
          });
          const versionNumber = (latest?.version || 0) + 1;
          await tx.documentVersion.updateMany({ where: { documentId }, data: { isCurrent: false } });
          const version = await tx.documentVersion.create({
            data: {
              documentId,
              version: versionNumber,
              name: `synthetic-v${versionNumber}.txt`,
              originalFileName: `synthetic-v${versionNumber}.txt`,
              mimeType: 'text/plain',
              size: versionNumber,
              storageReference,
              spItemId: storageReference,
              isCurrent: true,
              reviewStatus: 'NOT_IN_REVIEW',
              publicationStatus: 'INTERNAL_ONLY',
              uploadSource: 'LAWYER_UPLOAD',
              versionType: 'WORKING_COPY',
              uploadedById: ids.user,
              previousVersionId: latest?.id || null,
            },
          });
          await tx.document.update({
            where: { id: documentId },
            data: { version: String(versionNumber), currentVersion: versionNumber, currentVersionInt: versionNumber, spItemId: storageReference },
          });
          return version;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (attempt < 3 && isSerializationConflict(error)) continue;
        throw error;
      }
    }
    throw new Error('unreachable version retry state');
  };

  const promoteVersion = async (documentId: string, versionId: string) => {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "documents" WHERE "id" = ${documentId} FOR UPDATE`;
          const target = await tx.documentVersion.findFirst({
            where: { id: versionId, documentId },
            select: { id: true },
          });
          if (!target) throw new Error('Document version not found for document');
          await tx.documentVersion.updateMany({ where: { documentId }, data: { isCurrent: false } });
          const selected = await tx.documentVersion.update({ where: { id: versionId }, data: { isCurrent: true } });
          await tx.document.update({
            where: { id: documentId },
            data: { version: String(selected.version), currentVersion: selected.version, currentVersionInt: selected.version, spItemId: selected.spItemId },
          });
          return selected;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (attempt < 3 && isSerializationConflict(error)) continue;
        throw error;
      }
    }
    throw new Error('unreachable promotion retry state');
  };

  it('creates integer versions with lineage and exact historical metadata', async () => {
    const v2 = await uploadVersion(ids.document, 'storage-v2');
    const v3 = await uploadVersion(ids.document, 'storage-v3');
    const versions = await db.documentVersion.findMany({ where: { documentId: ids.document }, orderBy: { version: 'asc' } });

    expect(versions.map((version) => version.version)).toEqual([1, 2, 3]);
    expect(v2.previousVersionId).toBe(versions[0].id);
    expect(v3.previousVersionId).toBe(v2.id);
    expect(versions.map((version) => version.storageReference)).toEqual(['storage-v1', 'storage-v2', 'storage-v3']);
    expect(versions.filter((version) => version.isCurrent)).toHaveLength(1);
    expect(versions.find((version) => version.isCurrent)?.version).toBe(3);
  });

  it('keeps numbering independent per logical document', async () => {
    const crossV2 = await uploadVersion(ids.crossDocument, 'cross-storage-v2');
    expect(crossV2.version).toBe(2);
    const primaryMax = await db.documentVersion.aggregate({ where: { documentId: ids.document }, _max: { version: true } });
    expect(primaryMax._max.version).toBe(3);
  });

  it('promotes current version without mutating review or publication status', async () => {
    const v1Before = await db.documentVersion.findFirstOrThrow({ where: { documentId: ids.document, version: 1 } });
    await promoteVersion(ids.document, v1Before.id);
    const v1After = await db.documentVersion.findUniqueOrThrow({ where: { id: v1Before.id } });
    const currentCount = await db.documentVersion.count({ where: { documentId: ids.document, isCurrent: true } });

    expect(currentCount).toBe(1);
    expect(v1After.isCurrent).toBe(true);
    expect(v1After.reviewStatus).toBe(v1Before.reviewStatus);
    expect(v1After.publicationStatus).toBe(v1Before.publicationStatus);
    expect(v1After.versionType).toBe(v1Before.versionType);
  });

  it('rejects cross-document promotion and preserves the one-current invariant', async () => {
    const crossVersion = await db.documentVersion.findFirstOrThrow({ where: { documentId: ids.crossDocument, version: 1 } });
    await expect(promoteVersion(ids.document, crossVersion.id)).rejects.toThrow();
    await expect(db.documentVersion.create({
      data: {
        documentId: ids.document,
        version: 99,
        name: 'bad-current.txt',
        originalFileName: 'bad-current.txt',
        storageReference: 'bad-current',
        spItemId: 'bad-current',
        isCurrent: true,
        uploadedById: ids.user,
      },
    })).rejects.toThrow();

    expect(await db.documentVersion.count({ where: { documentId: ids.document, isCurrent: true } })).toBe(1);
  });

  it('preserves invariants across concurrent version creation and promotion attempts', async () => {
    const [v4, v5] = await Promise.all([
      uploadVersion(ids.document, 'storage-concurrent-a'),
      uploadVersion(ids.document, 'storage-concurrent-b'),
    ]);
    expect([v4.version, v5.version].sort((a, b) => a - b)).toEqual([4, 5]);
    expect(await db.documentVersion.count({ where: { documentId: ids.document, isCurrent: true } })).toBe(1);

    const targets = await db.documentVersion.findMany({ where: { documentId: ids.document, version: { in: [1, 5] } } });
    await Promise.all(targets.map((version) => promoteVersion(ids.document, version.id)));
    expect(await db.documentVersion.count({ where: { documentId: ids.document, isCurrent: true } })).toBe(1);
  });

  it('keeps backfilled legacy versions readable through nullable modern metadata', async () => {
    const legacy = await db.documentVersion.create({
      data: {
        documentId: ids.crossDocument,
        version: 3,
        name: 'legacy-version-name-only.txt',
        uploadedById: ids.user,
      },
    });

    const fetched = await db.documentVersion.findUniqueOrThrow({ where: { id: legacy.id } });
    expect(fetched.name).toBe('legacy-version-name-only.txt');
    expect(fetched.originalFileName).toBeNull();
    expect(fetched.reviewStatus).toBe('NOT_IN_REVIEW');
    expect(fetched.publicationStatus).toBe('INTERNAL_ONLY');
  });
});
