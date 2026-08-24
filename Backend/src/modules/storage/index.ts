/**
 * DW0 — storage provider factory.
 *
 * Selects the binary-object storage provider based on environment. Production
 * defaults to the SharePoint adapter. Tests select the isolated filesystem
 * adapter via DW0_STORAGE_PROVIDER=filesystem + a temp root.
 *
 * NOTE: the documents service wires `put`/`get`/`delete` through this factory
 * via `getDocumentStorage()`. A test may replace the provider with the
 * filesystem adapter by setting the environment BEFORE the service is used, or
 * by calling `setDocumentStorageForTests(...)`.
 */

import { BinaryObjectStorage } from './interface';
import { FilesystemObjectStorage, createFilesystemObjectStorage } from './filesystemAdapter';
import { createSharePointObjectStorage } from './sharepointAdapter';

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let injectedStorage: BinaryObjectStorage | null = null;
let cachedDefaultStorage: BinaryObjectStorage | null = null;

function defaultTempRoot(): string {
  const base = path.join(os.tmpdir(), 'adminiculum-dw0');
  fs.mkdirSync(base, { recursive: true });
  return base;
}

function buildDefaultStorage(): BinaryObjectStorage {
  const provider = (process.env.DW0_STORAGE_PROVIDER || 'sharepoint').toLowerCase();
  if (provider === 'filesystem') {
    return createFilesystemObjectStorage(process.env.DW0_STORAGE_ROOT || defaultTempRoot());
  }
  // Lazy-import the SharePoint drive service so the filesystem path never needs
  // Graph credentials present.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const driveService = require('../sharepoint/driveService.js').default;
  return createSharePointObjectStorage(driveService, '', 'Drafts');
}

/** Resolve the active storage provider. Defaults to SharePoint in production. */
export function getDocumentStorage(): BinaryObjectStorage {
  if (injectedStorage) return injectedStorage;
  if (!cachedDefaultStorage) {
    cachedDefaultStorage = buildDefaultStorage();
  }
  return cachedDefaultStorage;
}

/** Test-only seam: inject a deterministic filesystem adapter. */
export function setDocumentStorageForTests(storage: BinaryObjectStorage | null): void {
  injectedStorage = storage;
}

/** Test-only: clear the cached default (used when switching provider env). */
export function resetDocumentStorageCache(): void {
  cachedDefaultStorage = null;
  injectedStorage = null;
}

export type { BinaryObjectStorage };
export { FilesystemObjectStorage };