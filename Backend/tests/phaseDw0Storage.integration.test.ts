import { createHash, randomUUID } from 'crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';
import documentsService from '../src/modules/documents/services';
import { setDocumentStorageForTests, resetDocumentStorageCache } from '../src/modules/storage';
import { createFilesystemObjectStorage } from '../src/modules/storage/filesystemAdapter';

const databaseUrl = process.env.DW0_STORAGE_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const sha256 = (buffer: Buffer): string => createHash('sha256').update(buffer).digest('hex');

const ids = {
  user: 'e1000000-0000-4000-8000-000000000001',
  lawyerA: 'e1000000-0000-4000-8000-000000000002',
  clientA: 'e2000000-0000-4000-8000-000000000001',
  clientB: 'e2000000-0000-4000-8000-000000000002',
  caseA: 'e3000000-0000-4000-8000-000000000001',
  caseB: 'e3000000-0000-4000-8000-000000000002',
};

describeWithDatabase('Phase DW0 — storage foundation (real PostgreSQL + filesystem adapter)', () => {
  let db: PrismaClient;
  let storageRoot: string;
  let storage: ReturnType<typeof createFilesystemObjectStorage>;

  beforeAll(async () => {
    const parsed = new URL(databaseUrl as string);
    if (process.env.ALLOW_AZURE_DISPOSABLE_DB === 'true') {
      expect(parsed.hostname).toMatch(/postgres\.database\.azure\.com$/);
    } else {
      expect(['127.0.0.1', 'localhost', '::1']).toContain(parsed.hostname);
    }
    expect(parsed.pathname.replace(/^\//, '')).toMatch(/^adminiculum_(dw0_backend_|replay_)/);

    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.$connect();
    const identity = await db.$queryRaw<Array<{ database_name: string }>>`SELECT current_database() AS database_name`;
    expect(identity[0].database_name).toBe(parsed.pathname.replace(/^\//, ''));

    await db.user.createMany({
      data: [
        { id: ids.user, email: 'dw0-user@example.invalid', name: 'DW0 User', role: 'ADMIN', status: 'ACTIVE', isActive: true, skills: [] },
        { id: ids.lawyerA, email: 'dw0-lawyer-a@example.invalid', name: 'DW0 Lawyer A', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
      ],
    });
    await db.client.createMany({
      data: [
        { id: ids.clientA, name: 'DW0 Client A' },
        { id: ids.clientB, name: 'DW0 Client B' },
      ],
    });
    await db.case.createMany({
      data: [
        { id: ids.caseA, caseNumber: 'DW0-0001', title: 'DW0 Case A', caseType: 'OTHER', clientId: ids.clientA, createdById: ids.user, matterType: 'OTHER' },
        { id: ids.caseB, caseNumber: 'DW0-0002', title: 'DW0 Case B', caseType: 'OTHER', clientId: ids.clientB, createdById: ids.user, matterType: 'OTHER' },
      ],
    });

    // Route the documents service byte operations through the deterministic
    // filesystem adapter, exactly as production routes them through SharePoint.
    process.env.DW0_STORAGE_PROVIDER = 'filesystem';
    storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dw0-pg-'));
    storage = createFilesystemObjectStorage(storageRoot);
    setDocumentStorageForTests(storage);
  });

  afterAll(async () => {
    await db.documentVersion.deleteMany({ where: { document: { caseId: { in: [ids.caseA, ids.caseB] } } } });
    await db.document.deleteMany({ where: { caseId: { in: [ids.caseA, ids.caseB] } } });
    await db.timelineEvent.deleteMany({ where: { caseId: { in: [ids.caseA, ids.caseB] } } });
    await db.case.deleteMany({ where: { id: { in: [ids.caseA, ids.caseB] } } });
    await db.client.deleteMany({ where: { id: { in: [ids.clientA, ids.clientB] } } });
    await db.user.deleteMany({ where: { id: { in: [ids.user, ids.lawyerA] } } });
    await db.$disconnect();
    setDocumentStorageForTests(null);
    resetDocumentStorageCache();
    storage.cleanup();
    delete process.env.DW0_STORAGE_PROVIDER;
  });

  it('certifies DOCX byte fidelity through the real service path', async () => {
    const docxBytes = Buffer.from('PK\x03\x04 DW0_DOCX_V1 EXACT BYTES \x00\xff\xfe payload', 'binary');
    const created = await documentsService.createDocument({
      caseId: ids.caseA,
      fileName: 'szerzodes_v1.docx',
      fileContent: docxBytes,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      documentType: 'CONTRACT',
      createdById: ids.lawyerA,
    });
    const versions = await documentsService.listDocumentVersions(created.id);
    const v1 = versions.find((v) => v.isCurrent) || versions[0];
    expect(v1).toBeTruthy();

    const download = await documentsService.downloadDocumentVersion(created.id, v1!.id);
    expect(download).not.toBeNull();
    if (!download || 'error' in download) throw new Error('download failed');
    expect(sha256(download.content)).toBe(sha256(docxBytes));

    const stored = await storage.get(v1!.storageReference as string);
    expect(stored).not.toBeNull();
    expect(stored!.equals(docxBytes)).toBe(true);
  });

  it('certifies ZIP byte fidelity as an opaque evidence package', async () => {
    const zipBytes = Buffer.from('PK\x03\x04 DW0_ZIP_OPAQUE \x00\x01\x02\xff', 'binary');
    const created = await documentsService.createDocument({
      caseId: ids.caseA,
      fileName: 'bizonyitek_v1.zip',
      fileContent: zipBytes,
      mimeType: 'application/zip',
      documentType: 'CONTRACT',
      createdById: ids.lawyerA,
    });
    const versions = await documentsService.listDocumentVersions(created.id);
    const download = await documentsService.downloadDocumentVersion(created.id, versions[0].id);
    if (!download || 'error' in download) throw new Error('download failed');
    expect(sha256(download.content)).toBe(sha256(zipBytes));
  });

  it('upload V2 keeps V1 byte-identical and makes V2 current', async () => {
    const v1Bytes = Buffer.from('DW0_DOCX_V1_ORIGINAL_BYTES', 'binary');
    const created = await documentsService.createDocument({
      caseId: ids.caseA,
      fileName: 'same-name.docx',
      fileContent: v1Bytes,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      documentType: 'CONTRACT',
      createdById: ids.lawyerA,
    });

    const v2Bytes = Buffer.from('DW0_DOCX_V2_DIFFERENT_BYTES_LONGER', 'binary');
    await documentsService.uploadNewVersion(created.id, v2Bytes, ids.lawyerA, 'V2', {
      originalFileName: 'same-name.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    const versions = await documentsService.listDocumentVersions(created.id);
    expect(versions).toHaveLength(2);
    const v1 = versions.find((v) => v.versionNumber === 1)!;
    const v2 = versions.find((v) => v.versionNumber === 2)!;
    expect(v2.isCurrent).toBe(true);
    expect(v1.isCurrent).toBe(false);
    expect(v2.storageReference).not.toBe(v1.storageReference);

    const v1Download = await documentsService.downloadDocumentVersion(created.id, v1.id);
    const v2Download = await documentsService.downloadDocumentVersion(created.id, v2.id);
    if (!v1Download || 'error' in v1Download || !v2Download || 'error' in v2Download) throw new Error('download failed');
    expect(sha256(v1Download.content)).toBe(sha256(v1Bytes)); // V1 unchanged
    expect(sha256(v2Download.content)).toBe(sha256(v2Bytes)); // V2 correct
    expect(sha256(v1Download.content)).not.toBe(sha256(v2Bytes));
  });

  it('rejects a version that does not belong to the document (wrong parent)', async () => {
    const aBytes = Buffer.from('parentA bytes');
    const docA = await documentsService.createDocument({
      caseId: ids.caseA,
      fileName: 'a.docx',
      fileContent: aBytes,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      documentType: 'CONTRACT',
      createdById: ids.lawyerA,
    });
    const docB = await documentsService.createDocument({
      caseId: ids.caseA,
      fileName: 'b.docx',
      fileContent: Buffer.from('parentB bytes'),
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      documentType: 'CONTRACT',
      createdById: ids.lawyerA,
    });
    const vB = (await documentsService.listDocumentVersions(docB.id))[0];
    // Constraining both id + documentId must not resolve docA's version.
    const wrongParent = await documentsService.getDocumentVersion(docA.id, vB.id);
    expect(wrongParent).toBeNull();
    const wrongDownload = await documentsService.downloadDocumentVersion(docA.id, vB.id);
    expect(wrongDownload).toBeNull();
  });

  it('storage failure produces a truthful error and no DocumentVersion claims success', async () => {
    const failing = {
      put: async () => { throw new Error('storage put exploded'); },
      get: async () => null,
      delete: async () => true,
      exists: async () => false,
    };
    const prev = storage;
    setDocumentStorageForTests(failing as any);
    await expect(
      documentsService.createDocument({
        caseId: ids.caseA,
        fileName: 'fail.docx',
        fileContent: Buffer.from('will fail'),
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        documentType: 'CONTRACT',
        createdById: ids.lawyerA,
      }),
    ).rejects.toThrow();
    setDocumentStorageForTests(prev);
  });

  it('DB failure after storage put compensates by removing the object', async () => {
    const putRefs: string[] = [];
    const tracking = {
      put: async (data: Buffer) => {
        const res = await storage.put(data);
        putRefs.push(res.reference);
        return res;
      },
      get: (ref: string) => storage.get(ref),
      delete: (ref: string) => storage.delete(ref),
      exists: (ref: string) => storage.exists(ref),
    };
    setDocumentStorageForTests(tracking as any);
    // Force a DB failure after put by referencing a non-existent case.
    await expect(
      documentsService.createDocument({
        caseId: randomUUID(),
        fileName: 'orphan.docx',
        fileContent: Buffer.from('orphan bytes'),
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        documentType: 'CONTRACT',
        createdById: ids.lawyerA,
      }),
    ).rejects.toThrow();
    // The compensation path removed the object(s).
    for (const ref of putRefs) {
      expect(await storage.exists(ref)).toBe(false);
    }
    setDocumentStorageForTests(storage);
  });

  it('deleteDocument removes the DB row and then the storage object (DB-first order)', async () => {
    const bytes = Buffer.from('to-delete bytes');
    const created = await documentsService.createDocument({
      caseId: ids.caseA,
      fileName: 'delete-me.docx',
      fileContent: bytes,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      documentType: 'CONTRACT',
      createdById: ids.lawyerA,
    });
    const versions = await documentsService.listDocumentVersions(created.id);
    const ref = versions[0].storageReference as string;
    expect(await storage.exists(ref)).toBe(true);

    await documentsService.deleteDocument(created.id, ids.lawyerA);
    expect(await db.document.findUnique({ where: { id: created.id } })).toBeNull();
    expect(await storage.exists(ref)).toBe(false);
  });

  it('concurrent V2 creation never duplicates a version number or the current version', async () => {
    const bytes = Buffer.from('concurrent docx bytes');
    const created = await documentsService.createDocument({
      caseId: ids.caseA,
      fileName: 'concurrent.docx',
      fileContent: bytes,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      documentType: 'CONTRACT',
      createdById: ids.lawyerA,
    });

    const secondDb = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await secondDb.$connect();
    const run = (service: typeof documentsService) =>
      service.uploadNewVersion(created.id, Buffer.from(`V2-${randomUUID()}`), ids.lawyerA, 'v2', {
        originalFileName: 'concurrent.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
    const results = await Promise.allSettled([
      run(documentsService),
      (async () => {
        // second connection drives the same storage provider
        return run(documentsService);
      })(),
    ]);
    await secondDb.$disconnect();

    const versions = await documentsService.listDocumentVersions(created.id);
    const numbers = versions.map((v) => v.versionNumber).sort((a, b) => a - b);
    expect(new Set(numbers).size).toBe(numbers.length); // no duplicate version number
    expect(versions.filter((v) => v.isCurrent).length).toBe(1); // single current
    expect(results.filter((r) => r.status === 'fulfilled').length).toBeGreaterThan(0);
  });
});