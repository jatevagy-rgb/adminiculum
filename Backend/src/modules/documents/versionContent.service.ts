/**
 * Canonical immutable-version content reader (DOCUMENT-CONTENT-PIPELINE-1).
 *
 * Text for a selected/historical version MUST come from that exact
 * DocumentVersion's stored bytes. This module is the single version-bound text
 * source used by the document reader and the version-text endpoint:
 *
 *   DocumentVersion (exact row)
 *     -> immutable storage reference (spItemId || storageReference)
 *     -> download exact bytes
 *     -> shared textExtractor (DOCX/PDF/TXT; bounded)
 *     -> typed resolution { text } | { reasonCode, unavailableReason }
 *
 * It NEVER substitutes:
 *   - Document.workspaceText,
 *   - the latest/current version's text, or
 *   - another version's extracted text.
 *
 * `readVersionContentText` is pure over (descriptor, downloadBytes) so the
 * classification, decoding and truthful failure codes are unit-testable without
 * storage or a database, and no storage identifier or full content is ever
 * logged or returned.
 */
import { extractText } from './textExtractor';
import { isTextExtractable } from './comparison/versionText';

/** Response `source` value for version-bound extracted text. */
export const VERSION_CONTENT_SOURCE = 'UPLOADED';

/** The exact immutable version fields needed to resolve its own text. */
export interface VersionContentDescriptor {
  id: string;
  documentId: string;
  originalFileName: string | null;
  mimeType: string | null;
  size: number | null;
  securityScanStatus?: string | null;
  storageReference?: string | null;
  spItemId?: string | null;
}

/** Downloads the bytes behind a single immutable storage reference; null on failure. */
export type VersionContentDownload = (storageId: string) => Promise<Buffer | null>;

export type VersionContentUnavailableReasonCode =
  | 'NO_VERSION_STORAGE_REFERENCE'
  | 'FORMAT_NOT_TEXT_EXTRACTABLE'
  | 'CONTENT_UNAVAILABLE'
  | 'NO_EXTRACTABLE_TEXT'
  | 'CONTENT_TOO_LARGE'
  | 'EXTRACTION_FAILED';

/**
 * Flat, JSON-safe resolution of one version's text. Deliberately not a
 * discriminated union so callers can map it straight onto a response DTO.
 */
export interface VersionContentResolution {
  available: boolean;
  text: string | null;
  format: string | null;
  pageCount: number | null;
  reasonCode: VersionContentUnavailableReasonCode | null;
  unavailableReason: string | null;
}

const REASON_MESSAGES: Record<VersionContentUnavailableReasonCode, string> = {
  NO_VERSION_STORAGE_REFERENCE: 'A verzióhoz nem tartozik tárolt tartalom, ezért a szöveg nem nyerhető ki.',
  FORMAT_NOT_TEXT_EXTRACTABLE: 'Ez a formátum nem támogatja a szövegkinyerést.',
  CONTENT_UNAVAILABLE: 'A verzió tárolt tartalma jelenleg nem érhető el.',
  NO_EXTRACTABLE_TEXT: 'A verzió nem tartalmaz géppel kinyerhető szöveget.',
  CONTENT_TOO_LARGE: 'A verzió tartalma túl nagy a szövegkinyeréshez.',
  EXTRACTION_FAILED: 'A verzió szövegének kinyerése sikertelen volt.',
};

export function versionContentReasonMessage(reasonCode: string): string {
  return REASON_MESSAGES[reasonCode as VersionContentUnavailableReasonCode] || 'A verzió szövege nem érhető el.';
}

/** The immutable storage identity of a version, or null when none is recorded. */
export function versionStorageReference(version: Pick<VersionContentDescriptor, 'spItemId' | 'storageReference'>): string | null {
  for (const candidate of [version.spItemId, version.storageReference]) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate;
  }
  return null;
}

/**
 * One ordered attempt at resolving document-level preview text, most
 * authoritative first. The current immutable version is the canonical source;
 * the document-level SharePoint pointer is a legacy fallback for rows created
 * before the version foundation and is only consulted when the version records
 * no storage at all.
 */
export interface DocumentTextAttempt {
  source: 'VERSION' | 'DOCUMENT';
  storageId: string;
}

export function planDocumentTextSources(input: {
  currentVersion: Pick<VersionContentDescriptor, 'spItemId' | 'storageReference'> | null | undefined;
  documentStorageId: string | null | undefined;
}): DocumentTextAttempt[] {
  const attempts: DocumentTextAttempt[] = [];
  const versionStorageId = input.currentVersion ? versionStorageReference(input.currentVersion) : null;
  if (versionStorageId) attempts.push({ source: 'VERSION', storageId: versionStorageId });
  const documentStorageId = typeof input.documentStorageId === 'string' && input.documentStorageId.trim().length > 0
    ? input.documentStorageId
    : null;
  if (documentStorageId && documentStorageId !== versionStorageId) {
    attempts.push({ source: 'DOCUMENT', storageId: documentStorageId });
  }
  return attempts;
}

function unavailable(reasonCode: VersionContentUnavailableReasonCode): VersionContentResolution {
  return {
    available: false,
    text: null,
    format: null,
    pageCount: null,
    reasonCode,
    unavailableReason: versionContentReasonMessage(reasonCode),
  };
}

/**
 * Resolve the authoritative text of exactly one version from its own bytes.
 * Never falls back to another version or to document-level text.
 */
export async function readVersionContentText(
  version: VersionContentDescriptor,
  download: VersionContentDownload,
): Promise<VersionContentResolution> {
  if (!isTextExtractable(version.mimeType, version.originalFileName)) {
    return unavailable('FORMAT_NOT_TEXT_EXTRACTABLE');
  }
  const storageId = versionStorageReference(version);
  if (!storageId) {
    return unavailable('NO_VERSION_STORAGE_REFERENCE');
  }

  let buffer: Buffer | null = null;
  try {
    buffer = await download(storageId);
  } catch {
    buffer = null;
  }
  if (!buffer) {
    return unavailable('CONTENT_UNAVAILABLE');
  }

  try {
    const extraction = await extractText(
      buffer,
      version.mimeType || 'application/octet-stream',
      version.originalFileName || undefined,
    );
    if (!extraction.success || !extraction.text?.trim()) {
      const reasonCode = (extraction.reasonCode as VersionContentUnavailableReasonCode) || 'EXTRACTION_FAILED';
      return {
        available: false,
        text: null,
        format: null,
        pageCount: null,
        reasonCode,
        // Prefer the extractor's own safe, human-readable message when present.
        unavailableReason: extraction.error || versionContentReasonMessage(reasonCode),
      };
    }
    return {
      available: true,
      text: extraction.text,
      format: extraction.format ?? null,
      pageCount: extraction.pageCount ?? null,
      reasonCode: null,
      unavailableReason: null,
    };
  } catch {
    return unavailable('EXTRACTION_FAILED');
  }
}
