/**
 * DW0 — SharePoint binary-object adapter.
 *
 * Wraps the existing Graph/SharePoint `driveService` behind the provider-neutral
 * BinaryObjectStorage interface. Preserves current production behavior:
 *
 *   - put    -> driveService.uploadDocument(...)  ; opaque ref = SharePoint item id
 *   - get    -> driveService.downloadDocumentResult(ref) ; exact stored bytes
 *   - delete -> driveService.deleteDocument(ref)
 *   - exists -> driveService.getDocument(ref) != null
 *
 * No credential changes. No local fallback in production. The opaque reference
 * is the SharePoint DriveItem id (returned by the provider, never supplied by
 * the browser).
 */

import {
  BinaryObjectStorage,
  PutResult,
  StorageObjectMeta,
  StorageWriteError,
} from './interface';

function assertNonEmptyReference(reference: string): void {
  if (typeof reference !== 'string' || !reference.trim() || reference.length > 512) {
    throw new StorageWriteError('get', 'Invalid storage reference.', null);
  }
}

interface DriveServiceLike {
  uploadDocument(options: {
    caseId: string;
    fileName: string;
    content: Buffer;
    mimeType?: string;
    folder?: string;
  }): Promise<{ success: boolean; item?: { id?: string; name?: string } | null; error?: string; webUrl?: string; version?: string }>;
  downloadDocumentResult(documentId: string): Promise<{ success: true; content: Buffer } | { success: false; error: string; code: string; status?: number }>;
  deleteDocument(documentId: string): Promise<boolean>;
  getDocument(documentId: string): Promise<{ id?: string } | null>;
}

export class SharePointObjectStorage implements BinaryObjectStorage {
  constructor(
    private readonly drive: DriveServiceLike,
    private readonly caseRef: string,
    private readonly folder: string,
  ) {}

  async put(data: Buffer, meta?: StorageObjectMeta): Promise<PutResult> {
    const fileName = `dw0-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.bin`;
    const result = await this.drive.uploadDocument({
      caseId: this.caseRef,
      fileName,
      content: data,
      mimeType: meta?.mimeType || 'application/octet-stream',
      folder: this.folder,
    });
    if (!result.success || !result.item?.id) {
      throw new StorageWriteError('put', result.error || 'SharePoint upload failed.', result.error);
    }
    return { reference: result.item.id, size: data.length };
  }

  async get(reference: string): Promise<Buffer | null> {
    assertNonEmptyReference(reference);
    const result = await this.drive.downloadDocumentResult(reference);
    if (result.success === false) {
      if (result.code === 'SHAREPOINT_FILE_NOT_FOUND') return null;
      throw new StorageWriteError('get', result.error, result.code);
    }
    return result.content;
  }

  async delete(reference: string): Promise<boolean> {
    assertNonEmptyReference(reference);
    return this.drive.deleteDocument(reference);
  }

  async exists(reference: string): Promise<boolean> {
    assertNonEmptyReference(reference);
    const doc = await this.drive.getDocument(reference);
    return doc !== null && Boolean(doc.id);
  }

  async metadata(reference: string): Promise<StorageObjectMeta | null> {
    if (!this.exists(reference)) return null;
    return { size: null };
  }
}

export function createSharePointObjectStorage(
  drive: DriveServiceLike,
  caseRef: string,
  folder: string,
): SharePointObjectStorage {
  return new SharePointObjectStorage(drive, caseRef, folder);
}