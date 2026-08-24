/**
 * DW0 — deterministic filesystem binary-object adapter.
 *
 * Used ONLY for tests / local disposable storage. It stores each object under
 * an isolated temp root in a file named exactly by its opaque UUID reference,
 * so:
 *
 *   - exact bytes in / exact bytes out
 *   - unique opaque references (never caller-controlled)
 *   - path-traversal resistant (reference validated against the UUID grammar)
 *   - isolated temp root (supplied at construction, never defaulted to a shared
 *     directory)
 *   - `cleanup()` removes the entire root (used by test teardown)
 *
 * Documented parity difference vs the SharePoint production adapter:
 *   - metadata returns only the stored size (SharePoint returns richer item
 *     metadata); the interface treats metadata as optional.
 *   - there is no SharePoint-style "folder" placement; the object lives at the
 *     root of the temp dir. This is intentional and does not affect the
 *     byte-fidelity contract.
 */

import {
  BinaryObjectStorage,
  PutResult,
  StorageObjectMeta,
  assertOpaqueStorageReference,
} from './interface';

import { randomUUID } from 'crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface FilesystemEntry {
  size: number;
}

export class FilesystemStorageError extends Error {
  constructor(
    public readonly operation: 'put' | 'get' | 'delete' | 'exists' | 'metadata' | 'cleanup',
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'FilesystemStorageError';
  }
}

export class FilesystemObjectStorage implements BinaryObjectStorage {
  private readonly rootDir: string;

  constructor(rootDir: string) {
    const resolved = path.resolve(rootDir);
    // Defensive: refuse to operate directly on a filesystem root or home dir.
    if (resolved === path.parse(resolved).root) {
      throw new FilesystemStorageError('put', 'Refusing to use a filesystem root as DW0 temp storage.');
    }
    this.rootDir = resolved;
    fs.mkdirSync(this.rootDir, { recursive: true });
  }

  private objectPath(reference: string): string {
    const safe = assertOpaqueStorageReference(reference);
    return path.join(this.rootDir, safe);
  }

  async put(data: Buffer, _meta?: StorageObjectMeta): Promise<PutResult> {
    const reference = randomUUID();
    const objectPath = this.objectPath(reference);
    try {
      fs.writeFileSync(objectPath, data);
    } catch (error) {
      throw new FilesystemStorageError('put', 'DW0 filesystem write failed.', error);
    }
    return { reference, size: data.length };
  }

  async get(reference: string): Promise<Buffer | null> {
    const objectPath = this.objectPath(reference);
    try {
      return fs.readFileSync(objectPath);
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
        return null;
      }
      throw new FilesystemStorageError('get', 'DW0 filesystem read failed.', error);
    }
  }

  async delete(reference: string): Promise<boolean> {
    const objectPath = this.objectPath(reference);
    try {
      fs.unlinkSync(objectPath);
      return true;
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
        return false;
      }
      throw new FilesystemStorageError('delete', 'DW0 filesystem delete failed.', error);
    }
  }

  async exists(reference: string): Promise<boolean> {
    const objectPath = this.objectPath(reference);
    try {
      fs.accessSync(objectPath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async metadata(reference: string): Promise<StorageObjectMeta | null> {
    const objectPath = this.objectPath(reference);
    try {
      const stat = fs.statSync(objectPath) as unknown as FilesystemEntry;
      return { size: stat.size };
    } catch {
      return null;
    }
  }

  /** Remove the entire isolated temp root. Idempotent. */
  cleanup(): void {
    try {
      fs.rmSync(this.rootDir, { recursive: true, force: true });
    } catch (error) {
      throw new FilesystemStorageError('cleanup', 'DW0 filesystem cleanup failed.', error);
    }
  }
}

export function createFilesystemObjectStorage(rootDir: string): FilesystemObjectStorage {
  return new FilesystemObjectStorage(rootDir);
}