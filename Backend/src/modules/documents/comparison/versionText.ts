/**
 * Authoritative version-text provider (STRUCTURED-DOC-COMPARISON-1, Phase 4).
 *
 * Comparison may only run over text we can stand behind. Reuses the canonical
 * textExtractor pipeline for DOCX (Mammoth), PDF (pdf-parse), and plain text formats.
 * For unsupported/binary/empty/oversized formats, returns an explicit typed reason
 * code rather than fabricated text or geometry.
 *
 * Pure/decoupled: the async resolver takes its download capability as a
 * dependency so the classification and decoding are unit-testable without
 * storage or a database, and no storage identifier or full content is ever
 * logged or returned.
 */
import {
  extractText,
  detectFormat,
  MAX_EXTRACT_BYTES,
  MAX_EXTRACTED_TEXT_CHARS,
} from '../textExtractor';

/** Bump when extraction changes in a way that alters canonical text. */
export const EXTRACTION_REVISION = 2;

export { MAX_EXTRACT_BYTES, MAX_EXTRACTED_TEXT_CHARS };

export interface VersionTextResult {
  supported: boolean;
  text: string | null;
  /** Safe machine-readable reason when unsupported/failed (never leaks paths). */
  reasonCode: string | null;
  extractionRevision: number;
}

/** True for formats whose stored bytes or structure support authoritative plain text extraction. */
export function isTextExtractable(mimeType: string | null | undefined, fileName: string | null | undefined): boolean {
  if (detectFormat(mimeType || '', fileName || undefined)) return true;
  const mt = (mimeType || '').toLowerCase();
  if (mt.startsWith('text/')) return true;
  if (mt === 'application/json' || mt === 'application/xml') return true;
  const ext = (fileName || '').toLowerCase().split('.').pop() || '';
  return ext === 'txt' || ext === 'md' || ext === 'csv' || ext === 'docx' || ext === 'doc' || ext === 'pdf' || ext === 'html' || ext === 'htm' || ext === 'rtf';
}

/** Decode a text buffer as UTF-8, stripping a BOM. No normalization here — the engine owns that. */
export function decodeTextBuffer(buf: Buffer): string {
  let s = buf.toString('utf8');
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s;
}

export interface VersionMeta {
  id: string;
  documentId: string;
  mimeType: string | null;
  originalFileName: string | null;
  size: number | null;
}

/**
 * Resolve authoritative text for a version. `download` returns the raw bytes for
 * a (documentId, versionId) or null/error; ownership/authorization is enforced by
 * the caller before this runs.
 */
export async function resolveVersionText(
  version: VersionMeta,
  download: (documentId: string, versionId: string) => Promise<Buffer | null>,
): Promise<VersionTextResult> {
  const unsupported = (reasonCode: string): VersionTextResult => ({
    supported: false,
    text: null,
    reasonCode,
    extractionRevision: EXTRACTION_REVISION,
  });

  if (!isTextExtractable(version.mimeType, version.originalFileName)) {
    return unsupported('FORMAT_NOT_TEXT_EXTRACTABLE');
  }
  if (version.size != null && version.size > MAX_EXTRACT_BYTES) {
    return unsupported('CONTENT_TOO_LARGE');
  }
  let buf: Buffer | null;
  try {
    buf = await download(version.documentId, version.id);
  } catch {
    return unsupported('EXTRACTION_FAILED');
  }
  if (!buf) return unsupported('CONTENT_UNAVAILABLE');
  if (buf.byteLength > MAX_EXTRACT_BYTES) return unsupported('CONTENT_TOO_LARGE');

  try {
    const extraction = await extractText(
      buf,
      version.mimeType || 'application/octet-stream',
      version.originalFileName || undefined
    );

    if (!extraction.success) {
      return unsupported(extraction.reasonCode || 'EXTRACTION_FAILED');
    }

    if (!extraction.text || !extraction.text.trim()) {
      return unsupported('NO_EXTRACTABLE_TEXT');
    }

    if (extraction.text.length > MAX_EXTRACTED_TEXT_CHARS) {
      return unsupported('CONTENT_TOO_LARGE');
    }

    return {
      supported: true,
      text: extraction.text,
      reasonCode: null,
      extractionRevision: EXTRACTION_REVISION,
    };
  } catch {
    return unsupported('EXTRACTION_FAILED');
  }
}
