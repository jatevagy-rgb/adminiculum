// ============================================================================
// ANONYMIZE SOURCE TEXT — canonical version-bound source resolution.
// ============================================================================
//
// The Document Reader resolves a version's text from its own immutable storage
// reference (`DocumentVersion.spItemId || storageReference`) through
// `planDocumentTextSources` + `readVersionContentText`. This module reuses THAT
// SAME canonical source so the anonymization source read and the anonymization
// generation read the same bytes as the reader — never the legacy document-level
// `Document.spItemId` pointer alone, which can be null/stale even when the
// current version carries a valid storage reference.
//
// Pure over (descriptor, download): no database, no storage identity is logged,
// and the full extracted text is never persisted here.

import { extractText } from '../documents/textExtractor';
import { ANONYMIZE_MESSAGES } from './errors';
import {
  planDocumentTextSources,
  readVersionContentText,
  type VersionContentDescriptor,
} from '../documents/versionContent.service';

export const SOURCE_TEXT_LIMITATION_MESSAGE =
  ANONYMIZE_MESSAGES.SOURCE_NOT_AVAILABLE;

const SCAN_BLOCKED_MESSAGE =
  'A dokumentum biztonsági ellenőrzése még nem engedélyezi a tartalom megnyitását.';

export type AnonymizeSourceCode =
  | 'SOURCE_NOT_AVAILABLE'
  | 'SECURITY_SCAN_BLOCKED'
  | 'PROCESSING_FAILURE';

export interface AnonymizeSourceDescriptor {
  documentId?: string;
  /** Legacy document-level SharePoint pointer (fallback only). */
  spItemId?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
  name?: string | null;
  /** Current immutable version — the canonical source when it carries storage. */
  currentVersion?: VersionContentDescriptor | null;
}

export interface AnonymizeSourceResolution {
  available: boolean;
  text: string | null;
  scanBlocked: boolean;
  code: AnonymizeSourceCode | null;
  limitationMessage: string | null;
}

export type AnonymizeSourceDownload = (storageId: string) => Promise<Buffer | null>;

/**
 * Resolve the anonymization source text for one document/version using the
 * canonical immutable-version source. The current version's own storage is
 * authoritative; the document-level pointer is only a legacy fallback for rows
 * created before the version foundation. The security-scan gate (CLEAN-only)
 * applies before any download, exactly like the document reader.
 */
export async function resolveAnonymizeSourceText(
  descriptor: AnonymizeSourceDescriptor,
  download: AnonymizeSourceDownload,
): Promise<AnonymizeSourceResolution> {
  if (descriptor.currentVersion && descriptor.documentId && descriptor.currentVersion.documentId !== descriptor.documentId) {
    return { available: false, text: null, scanBlocked: false, code: 'SOURCE_NOT_AVAILABLE', limitationMessage: SOURCE_TEXT_LIMITATION_MESSAGE };
  }
  const scanStatus = descriptor.currentVersion?.securityScanStatus ?? null;
  if (scanStatus !== 'CLEAN') {
    return {
      available: false,
      text: null,
      scanBlocked: true,
      code: 'SECURITY_SCAN_BLOCKED',
      limitationMessage: SCAN_BLOCKED_MESSAGE,
    };
  }

  const attempts = planDocumentTextSources({
    currentVersion: descriptor.currentVersion,
    documentStorageId: descriptor.spItemId,
  });

  for (const attempt of attempts) {
    if (attempt.source === 'VERSION' && descriptor.currentVersion) {
      const resolved = await readVersionContentText(descriptor.currentVersion, download);
      if (resolved.available && resolved.text?.trim()) {
        return {
          available: true,
          text: resolved.text,
          scanBlocked: false,
          code: null,
          limitationMessage: null,
        };
      }
      const code = resolved.reasonCode === 'EXTRACTION_FAILED' ? 'PROCESSING_FAILURE' : 'SOURCE_NOT_AVAILABLE';
      return { available: false, text: null, scanBlocked: false, code, limitationMessage: ANONYMIZE_MESSAGES[code] };
    }

    let buffer: Buffer | null = null;
    try {
      buffer = await download(attempt.storageId);
    } catch {
      buffer = null;
    }
    if (buffer) {
      let extracted;
      try { extracted = await extractText(
        buffer,
        descriptor.mimeType || 'application/octet-stream',
        descriptor.fileName || descriptor.name || undefined,
      ); } catch {
        return { available: false, text: null, scanBlocked: false, code: 'PROCESSING_FAILURE', limitationMessage: ANONYMIZE_MESSAGES.PROCESSING_FAILURE };
      }
      const text = extracted.success ? (extracted.text || '').trim() : '';
      if (text.length > 0) {
        return {
          available: true,
          text,
          scanBlocked: false,
          code: null,
          limitationMessage: null,
        };
      }
    }
  }

  return {
    available: false,
    text: null,
    scanBlocked: false,
    code: 'SOURCE_NOT_AVAILABLE',
    limitationMessage: SOURCE_TEXT_LIMITATION_MESSAGE,
  };
}
