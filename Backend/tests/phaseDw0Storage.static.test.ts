import { randomUUID } from 'crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createFilesystemObjectStorage, FilesystemObjectStorage } from '../src/modules/storage/filesystemAdapter';
import { isOpaqueStorageReference, StorageReferenceError } from '../src/modules/storage/interface';

describe('Phase DW0 — filesystem storage adapter (no PG required)', () => {
  let root: string;
  let storage: FilesystemObjectStorage;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'dw0-static-'));
    storage = createFilesystemObjectStorage(root);
  });

  afterEach(() => {
    storage.cleanup();
  });

  it('round-trips exact bytes (byte fidelity)', async () => {
    const data = Buffer.from('DOCX_V1_EXACT_BYTES_0123456789', 'utf8');
    const put = await storage.put(data);
    const got = await storage.get(put.reference);
    expect(got).not.toBeNull();
    expect(got!.equals(data)).toBe(true);
  });

  it('round-trips binary DOCX/ZIP/PDF bytes with NULs and high bytes', async () => {
    const binary = Buffer.from([
      0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0xff, 0xfe, 0x00, 0x01, 0x80, 0x7f,
    ]);
    const put = await storage.put(binary);
    const got = await storage.get(put.reference);
    expect(got!.equals(binary)).toBe(true);
  });

  it('returns an opaque UUID reference (never caller-controlled)', async () => {
    const put = await storage.put(Buffer.from('x'));
    expect(isOpaqueStorageReference(put.reference)).toBe(true);
    expect(put.reference).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('generates a distinct reference per put', async () => {
    const a = await storage.put(Buffer.from('a'));
    const b = await storage.put(Buffer.from('b'));
    expect(a.reference).not.toBe(b.reference);
  });

  it('exists() reports present/absent', async () => {
    const put = await storage.put(Buffer.from('abc'));
    expect(await storage.exists(put.reference)).toBe(true);
    expect(await storage.exists(randomUUID())).toBe(false);
  });

  it('get() returns null for an unknown reference', async () => {
    expect(await storage.get(randomUUID())).toBeNull();
  });

  it('metadata() returns the stored size', async () => {
    const put = await storage.put(Buffer.from('12345'));
    const meta = await storage.metadata!(put.reference);
    expect(meta).not.toBeNull();
    expect(meta!.size).toBe(5);
  });

  it('delete() removes the object; a second delete returns false', async () => {
    const put = await storage.put(Buffer.from('to-delete'));
    expect(await storage.delete(put.reference)).toBe(true);
    expect(await storage.exists(put.reference)).toBe(false);
    expect(await storage.delete(put.reference)).toBe(false);
  });

  it('rejects a path-traversal reference (never uses caller-supplied path)', async () => {
    await expect(storage.get('../../etc/passwd')).rejects.toBeInstanceOf(StorageReferenceError);
    await expect(storage.get('C:\\Windows\\system32')).rejects.toBeInstanceOf(StorageReferenceError);
    await expect(storage.delete('../x')).rejects.toBeInstanceOf(StorageReferenceError);
    expect(isOpaqueStorageReference('../../etc/passwd')).toBe(false);
  });

  it('keeps V1 and V2 byte-identical and independently downloadable', async () => {
    const v1 = Buffer.from('V1 original docx bytes');
    const v2 = Buffer.from('V2 different docx bytes - longer');
    const p1 = await storage.put(v1);
    const p2 = await storage.put(v2);
    expect(p1.reference).not.toBe(p2.reference);
    expect((await storage.get(p1.reference))!.equals(v1)).toBe(true);
    expect((await storage.get(p2.reference))!.equals(v2)).toBe(true);
    // V1 bytes unchanged after V2 written
    expect((await storage.get(p1.reference))!.equals(v1)).toBe(true);
  });

  it('refuses to treat a filesystem root as its temp root', () => {
    expect(() => createFilesystemObjectStorage(path.parse(root).root)).toThrow();
  });

  it('cleanup() is idempotent and removes all objects', async () => {
    const put = await storage.put(Buffer.from('temp'));
    expect(await storage.exists(put.reference)).toBe(true);
    storage.cleanup();
    expect(fs.existsSync(root)).toBe(false);
    storage.cleanup();
  });
});